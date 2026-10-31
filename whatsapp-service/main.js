const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
// Attachments arrive as base64 inside JSON; express.json's default 100 kB limit
// would reject any media with 413 before the handler ran.
app.use(express.json({ limit: '30mb' }));

/**
 * sessions map: sessionId -> { client, status, qr, info }
 * status: 'initializing' | 'qr_ready' | 'connected' | 'failed' | 'disconnected'
 */
const sessions = {};

// ── INIT SESSION ────────────────────────────────────────────────────────────

/**
 * Removes Chromium's profile lock left by a previous container. The lock names the old hostname, so
 * Chromium would treat it as a live process elsewhere and refuse to start. Only one client per
 * session runs here, so any lock at startup is stale.
 */
function clearStaleProfileLock(sessionId) {
    const dir = path.join('.wwebjs_auth', `session-${sessionId}`);
    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* not there */ }
    }
}

/**
 * Builds and starts a client for one session; used both for restoring at startup and for a new
 * connection.
 */
function startSession(sessionId) {
    sessions[sessionId] = { status: 'initializing', qr: null, info: null, client: null };
    clearStaleProfileLock(sessionId);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        }
    });

    sessions[sessionId].client = client;

    client.on('qr', async (qr) => {
        try {
            const qrBase64 = await qrcode.toDataURL(qr);
            sessions[sessionId].qr = qrBase64;
            sessions[sessionId].status = 'qr_ready';
            console.log(`[WhatsApp] QR ready for session: ${sessionId}`);
        } catch (e) {
            console.error('[WhatsApp] QR generation error:', e.message);
        }
    });

    client.on('ready', () => {
        const info = client.info;
        sessions[sessionId].status = 'connected';
        sessions[sessionId].info = {
            phone: info.wid.user,
            name: info.pushname || info.wid.user,
        };
        sessions[sessionId].qr = null;
        console.log(`[WhatsApp] Connected: session=${sessionId} phone=${info.wid.user}`);
    });

    client.on('auth_failure', () => {
        sessions[sessionId].status = 'failed';
        console.log(`[WhatsApp] Auth failure for session: ${sessionId}`);
    });

    client.on('disconnected', () => {
        sessions[sessionId].status = 'disconnected';
        console.log(`[WhatsApp] Disconnected: session=${sessionId}`);
    });

    client.initialize().catch(e => {
        console.error('[WhatsApp] Client init error:', e.stack || e.message);
        if (sessions[sessionId]) sessions[sessionId].status = 'failed';
    });

    return sessions[sessionId];
}

app.post('/init-session', (req, res) => {
    const sessionId = req.body.sessionId || uuidv4();
    const existing = sessions[sessionId];

    if (existing && existing.status === 'connected') {
        return res.json({ sessionId, status: 'connected', info: existing.info });
    }
    if (existing && existing.status === 'initializing') {
        return res.json({ sessionId, status: 'initializing' });
    }

    startSession(sessionId);
    res.json({ sessionId, status: 'initializing' });
});

const isPersisted = (sessionId) =>
    !!sessionId && fs.existsSync(path.join(__dirname, '.wwebjs_auth', `session-${sessionId}`));

/**
 * Finds a request's session, reviving it from disk if this process has not seen it. LocalAuth keeps
 * the login on disk, but the live clients are in memory and empty after a restart. Revived lazily,
 * since each session costs its own headless Chromium.
 *
 * Returns null while the client is still starting; the caller answers "try again".
 */
function ensureSession(sessionId) {
    const existing = sessions[sessionId];
    if (existing) return existing.status === 'connected' ? existing : null;
    if (!isPersisted(sessionId)) return null;

    console.log(`[WhatsApp] Reviving persisted session ${sessionId}`);
    // No QR is expected: LocalAuth replays the stored credentials. One revoked from the
    // phone emits `qr` instead and simply stays unconnected.
    startSession(sessionId);
    return null;
}

/**
 * Shared by every handler that needs a live client. The token arrives as a header on GET and in the
 * body on POST.
 */
function requireSession(req, res) {
    const token = req.headers['x-token'] || req.body?.token;
    const session = ensureSession(token);
    if (session) return session;

    if (isPersisted(token)) {
        res.status(503).json({ error: 'Session is reconnecting, retry shortly' });
    } else {
        res.status(401).json({ error: 'Not connected' });
    }
    return null;
}

// ── SESSION STATUS ───────────────────────────────────────────────────────────

app.get('/status', (req, res) => {
    const { sessionId } = req.query;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    res.json({
        status: session.status,
        qr: session.qr,
        info: session.info,
    });
});

// ── CHATS ────────────────────────────────────────────────────────────────────

/**
 * Reads the chat list inside the WhatsApp Web page, one chat at a time, instead of
 * client.getChats(), where one chat that fails to load rejects the whole list. A failing chat still
 * contributes its id, title and unread count. Runs in the browser and returns plain data.
 */
/* eslint-disable no-undef */
async function readChats() {
    const collection = window.require('WAWebCollections').Chat.getModelsArray();
    const chats = [];
    const failures = [];

    /**
     * The one-line preview for a chat row. For media `body` holds a base64 thumbnail, so the
     * caption or the attachment kind is shown instead.
     */
    const LABELS = {
        image: '📷 Фото', video: '🎥 Відео', ptt: '🎤 Голосове', audio: '🎵 Аудіо',
        document: '📄 Документ', sticker: '🩹 Стікер', location: '📍 Локація',
    };
    const previewOf = (msg) => {
        if (!msg) return null;
        const text = msg.type && msg.type !== 'chat'
            ? (msg.caption || LABELS[msg.type] || '📎 Вкладення')
            : (typeof msg.body === 'string' ? msg.body : null);
        // Capped once, for captions as well as bodies: a chat row shows one line, and the
        // rest is bytes crossing the wire on every poll for nothing.
        return text && text.length > 200 ? text.slice(0, 200) : text;
    };

    for (const chat of collection) {
        try {
            const model = await window.WWebJS.getChatModel(chat);
            chats.push({
                id: model.id?._serialized ?? null,
                name: model.formattedTitle || model.name || model.id?.user || null,
                isGroup: !!model.isGroup,
                lastMessageBody: previewOf(model.lastMessage),
                lastMessageTs: model.lastMessage?.t ?? model.t ?? null,
                unreadCount: model.unreadCount ?? 0,
            });
        } catch (e) {
            try {
                // The enrichment fails while resolving the last message out of IndexedDB,
                // so take it from the collection already in memory instead. Without this the
                // whole list would show no previews, which is most of what a chat row says.
                let lastMessageBody = null;
                let lastMessageTs = chat.t ?? null;
                try {
                    const messages = chat.msgs?.getModelsArray?.() ?? [];
                    const last = messages[messages.length - 1];
                    if (last) {
                        lastMessageBody = previewOf(last);
                        lastMessageTs = last.t ?? lastMessageTs;
                    }
                } catch { /* the row is still worth showing without a preview */ }

                // Everything else is read straight off the collection entry.
                chats.push({
                    id: chat.id?._serialized ?? null,
                    name: chat.formattedTitle || chat.id?.user || null,
                    isGroup: !!chat.groupMetadata,
                    lastMessageBody,
                    lastMessageTs,
                    unreadCount: chat.unreadCount ?? 0,
                });
                failures.push({ id: chat.id?._serialized ?? '?', reason: String(e?.message ?? e) });
            } catch (inner) {
                failures.push({ id: '?', reason: String(inner?.message ?? inner) });
            }
        }
    }

    return { chats: chats.filter(c => c.id), failures };
}
/* eslint-enable no-undef */

app.get('/chats', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    try {
        const { chats, failures } = await session.client.pupPage.evaluate(readChats);

        if (failures.length > 0) {
            console.warn(`[WhatsApp] ${failures.length} chat(s) needed the fallback:`,
                failures.slice(0, 5));
        }

        const result = chats.slice(0, 100).map(chat => ({
            id: chat.id,
            name: chat.name,
            type: chat.isGroup ? 'GROUP' : 'PERSONAL',
            // WhatsApp does not mark bots, so only group vs person is told apart.
            kind: chat.isGroup ? 'GROUP' : 'PERSON',
            last_message: chat.lastMessageBody,
            last_message_at: chat.lastMessageTs
                ? new Date(chat.lastMessageTs * 1000).toISOString()
                : null,
            unread_count: chat.unreadCount,
        }));
        res.json(result);
    } catch (e) {
        // Errors thrown inside the injected page arrive minified — `e.message` alone can be
        // a single letter, which says nothing. The stack is the only thing that identifies
        // where it came from, so it goes to the log rather than being swallowed.
        console.error('[WhatsApp] getChats failed:', e.stack || e.message);
        res.status(500).json({ error: `getChats failed: ${e.message}` });
    }
});

// ── MESSAGES ─────────────────────────────────────────────────────────────────

/**
 * Reads one chat's messages inside the page without getChatById, which fails on the same IndexedDB
 * lookup as the chat list. Each step is guarded separately so one odd message cannot empty the
 * chat.
 */
/* eslint-disable no-undef */
async function readMessages(chatId, limit) {
    const Collections = window.require('WAWebCollections');
    const wid = window.require('WAWebWidFactory').createWid(chatId);
    const chat = Collections.Chat.get(wid) || (await Collections.Chat.find(wid));
    if (!chat) return { error: 'chat not found', messages: [] };

    // Wids and message keys stopped carrying `_serialized` in newer WhatsApp Web builds;
    // their string form is the same value.
    const ser = (x) => (x ? (x._serialized ?? String(x)) : null);
    // Service entries ("messages are end-to-end encrypted", group changes) are not
    // messages, and `isNotification` is no longer set on them — so judge by type.
    const SERVICE = new Set(['e2e_notification', 'notification', 'notification_template',
        'gp2', 'broadcast_notification', 'call_log', 'protocol', 'pinned_message']);
    const keep = (m) => !m.isNotification && !SERVICE.has(m.type);
    let msgs = chat.msgs.getModelsArray().filter(keep);
    let loadError = null;
    try {
        const loader = window.require('WAWebChatLoadMessages');
        while (msgs.length < limit) {
            const loaded = await loader.loadEarlierMsgs({ chat });
            if (!loaded || !loaded.length) break;
            msgs = [...loaded.filter(keep), ...msgs];
        }
    } catch (e) {
        // What is already in memory is still worth returning.
        loadError = String(e?.message ?? e);
    }

    // Earlier pages can overlap what was already in memory.
    const seen = new Set();
    msgs = msgs.filter((m) => { const k = ser(m.id); if (seen.has(k)) return false; seen.add(k); return true; });
    msgs.sort((a, b) => (a.t > b.t ? 1 : -1));
    if (msgs.length > limit) msgs = msgs.slice(msgs.length - limit);

    const messages = msgs.map((m) => ({
        id: ser(m.id),
        body: typeof m.body === 'string' && (!m.type || m.type === 'chat') ? m.body : (m.caption || ''),
        type: m.type || 'chat',
        author: ser(m.author),
        from: ser(m.from),
        notifyName: m.notifyName || m.senderObj?.pushname || null,
        fromMe: !!m.id?.fromMe,
        t: m.t ?? null,
    })).filter((m) => m.id);

    return { messages, loadError };
}
/* eslint-enable no-undef */

/**
 * A sent message's id as a string. Newer WhatsApp Web builds omit `_serialized` on message keys, so
 * it is rebuilt from its parts.
 */
function messageKey(id) {
    if (!id) return null;
    if (id._serialized) return id._serialized;
    if (id.$1) return id.$1;
    const remote = typeof id.remote === 'string' ? id.remote : id.remote?._serialized;
    return `${id.fromMe}_${remote}_${id.id}`;
}

const MEDIA_LABELS = {
    image: '📷 Фото', video: '🎥 Відео', ptt: '🎤 Голосове', audio: '🎵 Аудіо',
    document: '📄 Документ', sticker: '🩹 Стікер', location: '📍 Локація',
};

app.get('/messages', async (req, res) => {
    const { chat_id, limit = 50 } = req.query;
    const session = requireSession(req, res);
    if (!session) return;

    try {
        const { messages, loadError, error } = await session.client.pupPage.evaluate(
            readMessages, chat_id, parseInt(limit) || 50);
        if (error) return res.status(404).json({ error });
        if (loadError) console.warn(`[WhatsApp] Older messages not loaded for ${chat_id}: ${loadError}`);

        const result = messages.map(m => ({
            id: m.id,
            text: m.body || (m.type !== 'chat' ? (MEDIA_LABELS[m.type] || '📎 Вкладення') : ''),
            sender_id: m.author || m.from,
            sender_name: m.notifyName || (m.author || m.from || '').split('@')[0],
            is_from_user: m.fromMe,
            timestamp: m.t ? new Date(m.t * 1000).toISOString() : null,
        }));
        res.json(result);
    } catch (e) {
        console.error(`[WhatsApp] fetchMessages failed for ${chat_id}:`, e.stack || e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── SEND ──────────────────────────────────────────────────────────────────────

app.post('/send', async (req, res) => {
    const { token, chat_id, text } = req.body;
    const session = requireSession(req, res);
    if (!session) return;

    try {
        const msg = await session.client.sendMessage(chat_id, text);
        res.json({
            message_id: messageKey(msg.id),
            timestamp: new Date(msg.timestamp * 1000).toISOString(),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Repackages a browser recording as OGG/Opus.
 *
 * WhatsApp shows a voice note as one only for opus. Chrome records opus too, but in a
 * webm container, so a container swap (-c:a copy) is tried first and a full re-encode
 * only after that — the path Safari's AAC takes.
 *
 * Without ffmpeg the original is returned: better sent as an audio file than not at all.
 */
async function toOggOpus(buffer, mimeType) {
    if (/ogg|opus/i.test(mimeType)) return { buffer, isOgg: true };

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
    const src = path.join(dir, 'input');
    const dst = path.join(dir, 'output.ogg');
    fs.writeFileSync(src, buffer);

    const attempts = [['-c:a', 'copy'], ['-c:a', 'libopus', '-b:a', '48k']];
    try {
        for (const codecArgs of attempts) {
            const ok = await new Promise((resolve) => {
                execFile('ffmpeg', ['-y', '-i', src, ...codecArgs, '-f', 'ogg', dst],
                    (err) => resolve(!err && fs.existsSync(dst) && fs.statSync(dst).size > 0));
            });
            if (ok) return { buffer: fs.readFileSync(dst), isOgg: true };
            if (fs.existsSync(dst)) fs.unlinkSync(dst);
        }
        console.warn('[WhatsApp] ffmpeg не перепакував запис — надсилаю як аудіофайл');
        return { buffer, isOgg: false };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

app.post('/send-media', async (req, res) => {
    const { token, chat_id, data_base64, mime_type, file_name, kind, caption } = req.body;
    const session = requireSession(req, res);
    if (!session) return;

    try {
        let buffer = Buffer.from(data_base64, 'base64');
        if (!buffer.length) return res.status(400).json({ error: 'Порожнє вкладення' });

        let mimetype = mime_type;
        let filename = file_name;
        let asVoice = false;

        if (kind === 'VOICE') {
            const converted = await toOggOpus(buffer, mime_type);
            buffer = converted.buffer;
            if (converted.isOgg) {
                mimetype = 'audio/ogg; codecs=opus';
                filename = 'voice.ogg';
                asVoice = true;
            }
        }

        const media = new MessageMedia(mimetype, buffer.toString('base64'), filename);
        const msg = await session.client.sendMessage(chat_id, media, {
            sendAudioAsVoice: asVoice,
            caption: caption || undefined,
            // Otherwise WhatsApp recompresses a PNG as a photo, spoiling what the
            // user deliberately sent as a file.
            sendMediaAsDocument: kind === 'FILE',
        });

        res.json({
            message_id: messageKey(msg.id),
            timestamp: new Date(msg.timestamp * 1000).toISOString(),
            voice_note: asVoice,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/delete', async (req, res) => {
    const { token, chat_id, message_id } = req.body;
    const session = requireSession(req, res);
    if (!session) return;

    try {
        const msg = await session.client.getMessageById(message_id);
        if (!msg) {
            // Already gone — for a delete that is the same as success.
            return res.json({ success: true });
        }
        // true = delete for everyone, which is what the button promises.
        await msg.delete(true);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── DISCONNECT ────────────────────────────────────────────────────────────────

app.post('/disconnect', async (req, res) => {
    const token = req.headers['x-token'] || req.body.token;
    const session = sessions[token];

    if (session) {
        try {
            await session.client.logout();
        } catch (_) {
            // Ignore logout errors
        }
        delete sessions[token];
    }

    // The stored credentials have to go too. Now that a request can revive a session from
    // disk, leaving the directory behind would let a disconnected account come back by
    // itself on the next poll.
    const authDir = path.join(__dirname, '.wwebjs_auth', `session-${token}`);
    try {
        fs.rmSync(authDir, { recursive: true, force: true });
    } catch (e) {
        // Chromium may still hold a file lock for a moment after logout. The account is
        // already gone from the backend, so this is worth logging and no more.
        console.error(`[WhatsApp] Could not remove ${authDir}:`, e.message);
    }

    res.json({ success: true });
});

// ── START ─────────────────────────────────────────────────────────────────────

// When the phone ends a session, LocalAuth.logout deletes the profile, which fails with EBUSY on
// Windows while Chromium holds the files. Nothing awaits that promise, and an unhandled rejection
// would exit Node and drop every other account's client.
process.on('unhandledRejection', (reason) => {
    console.error('[WhatsApp] Unhandled rejection:', reason?.stack || reason);
});

const PORT = Number(process.env.PORT) || 8204;
app.listen(PORT, () => console.log(`[WhatsApp] Service running on port ${PORT}`));
