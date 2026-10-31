const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
// Вкладення приходять як base64 у JSON. Типовий ліміт express.json — 100 КБ,
// тобто без цього рядка будь-яке медіа відхилялося б із 413 ще до обробника.
app.use(express.json({ limit: '30mb' }));

/**
 * sessions map: sessionId -> { client, status, qr, info }
 * status: 'initializing' | 'qr_ready' | 'connected' | 'failed' | 'disconnected'
 */
const sessions = {};

// ── INIT SESSION ────────────────────────────────────────────────────────────

/**
 * Builds and starts a client for one session.
 *
 * Extracted so that startup restoration and an explicit connect request go through exactly
 * the same path — a restored session that behaved differently from a freshly connected one
 * would be a very hard difference to spot.
 */
function startSession(sessionId) {
    sessions[sessionId] = { status: 'initializing', qr: null, info: null, client: null };

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
 * Resolves a request's session, reviving it from disk if this process has never seen it.
 *
 * LocalAuth persists the WhatsApp login under .wwebjs_auth, but the `sessions` map holding
 * the live clients is process memory and starts empty. So every restart of this service left
 * each account authenticated on disk yet invisible over HTTP: /chats answered 401 "Not
 * connected" while the UI still showed the account as connected, because that badge comes
 * from a row in the backend's database rather than from anything here.
 *
 * Revival is lazy rather than done for every stored session at boot. Each session costs its
 * own headless Chromium, and the directory accumulates one entry per connection attempt ever
 * made — starting a browser for each would spend most of them on logins nobody uses now.
 *
 * Returns null while the client is still coming up; the caller reports that as "try again"
 * rather than as a failure, and the next poll finds it ready.
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
 * Shared by every handler that needs a live client.
 *
 * Reads the token from either place it arrives: GETs carry it as a header, POSTs in the
 * body. Handling both here is what lets every route share one revival path.
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
 * Reads the chat list inside the WhatsApp Web page, one chat at a time.
 *
 * This replaces `client.getChats()`, which enriches every chat through `getChatModel` under
 * a single `Promise.all`. One chat that cannot be enriched — a group whose metadata will not
 * load, a newsletter, anything the library's selectors no longer match — rejects the whole
 * batch, and the caller receives nothing at all instead of the other two hundred chats that
 * were perfectly readable. That is what produced an empty WhatsApp list next to a session
 * that was demonstrably connected, reporting only a minified `r` for a reason.
 *
 * Per-chat isolation turns that into a degraded row rather than an empty screen: a chat that
 * fails enrichment still contributes its id, title and unread count, which is most of what a
 * list needs. Runs in the browser, so it returns plain data only.
 */
/* eslint-disable no-undef */
async function readChats() {
    const collection = window.require('WAWebCollections').Chat.getModelsArray();
    const chats = [];
    const failures = [];

    /**
     * The one-line preview for a chat row.
     *
     * On a media message `body` is not text — it holds the thumbnail as base64, which would
     * put kilobytes of JPEG data where the last message should be. The caption is the real
     * text when there is one; otherwise the row says what kind of attachment it was.
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
            // WhatsApp не позначає ботів окремо — розрізняємо лише групу й людину.
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

app.get('/messages', async (req, res) => {
    const { chat_id, limit = 50 } = req.query;
    const session = requireSession(req, res);
    if (!session) return;

    try {
        const chat = await session.client.getChatById(chat_id);
        const messages = await chat.fetchMessages({ limit: parseInt(limit) });

        const result = messages.map(m => ({
            id: m.id._serialized,
            text: m.body || '',
            sender_id: m.author || m.from,
            sender_name: m.notifyName || m._data?.notifyName || m.id.user,
            is_from_user: m.fromMe,
            timestamp: new Date(m.timestamp * 1000).toISOString(),
        }));
        res.json(result);
    } catch (e) {
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
            message_id: msg.id._serialized,
            timestamp: new Date(msg.timestamp * 1000).toISOString(),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Перепаковує запис із браузера в OGG/Opus.
 *
 * WhatsApp показує голосове голосовим лише для opus; Chrome пише той самий opus,
 * але в контейнері webm. Тому спершу пробуємо просту зміну контейнера (-c:a copy),
 * без перекодування, і лише потім кодуємо заново — це шлях для Safari з його AAC.
 *
 * Якщо ffmpeg недоступний, повертаємо оригінал: краще надіслати аудіофайлом,
 * ніж не надіслати взагалі.
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
            // Інакше WhatsApp стисне надісланий PNG як фото й зіпсує те,
            // що користувач свідомо надіслав файлом.
            sendMediaAsDocument: kind === 'FILE',
        });

        res.json({
            message_id: msg.id._serialized,
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
            // Уже немає — для видалення це той самий результат, що й успіх.
            return res.json({ success: true });
        }
        // true — видалити в усіх, а не лише в себе; саме цього очікують від кнопки.
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

// whatsapp-web.js runs its own cleanup when the phone ends a session — LocalAuth.logout
// deletes the browser profile — and on Windows Chromium still holds those files, so the
// unlink fails with EBUSY. Nothing awaits that promise, and an unhandled rejection exits
// Node, taking every other account's live client down with it. One session failing to
// clean up is worth a log line, not the whole service.
process.on('unhandledRejection', (reason) => {
    console.error('[WhatsApp] Unhandled rejection:', reason?.stack || reason);
});

const PORT = Number(process.env.PORT) || 8204;
app.listen(PORT, () => console.log(`[WhatsApp] Service running on port ${PORT}`));
