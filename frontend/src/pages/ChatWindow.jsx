import { useState, useEffect, useRef } from 'react';
import { Box, Typography, IconButton, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChatHeader from './chat/ChatHeader';
import MessageBubble from './chat/MessageBubble';
import MediaViewer from './chat/MediaViewer';
import websocketService from '../services/websocketService';
import telegramService from '../services/telegramService';
import slackService from '../services/slackService';
import discordService from '../services/discordService';
import whatsappService from '../services/whatsappService';
import viberService from '../services/viberService';
import notificationService from '../services/notificationService';
import archiveService from '../services/archiveService';
import autoReplyService from '../services/autoReplyService';
import { serviceFor, SUPPORTS_MEDIA, SUPPORTS_DELETE } from '../services/messengerServices';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import { radius, numeric } from '../theme/tokens';
import { formatDayLabel } from '../utils/format';
import { useAuth } from '../context/AuthContext';

/**
 * Text of chats already opened this session, so switching back renders with no request
 * at all. Media payloads are stripped before caching — a channel of photos would put
 * tens of megabytes of base64 in memory per chat, and the media is re-fetched through
 * the throttled queue anyway.
 */
const MESSAGE_CACHE = new Map();
const CACHE_LIMIT = 20;

/**
 * Media requests in flight at once.
 *
 * Every attachment costs a separate round trip through Telethon, which serialises them on
 * the account's single connection. Firing all fifty at once did not make them arrive
 * sooner — it queued them ahead of everything else, including the message fetch for the
 * next chat the user opened, which is what made switching chats feel frozen.
 */
const MEDIA_CONCURRENCY = 3;

const chatKey = (chat) => `${chat.messengerType}:${chat.messengerAccountId}:${chat.externalChatId}`;

const KIND_LABELS = { IMAGE: 'Фото', VIDEO: 'Відео', AUDIO: 'Аудіо', FILE: 'Файл' };

const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

const withoutMedia = (messages) => messages.map(({ mediaBase64, ...rest }) => rest);

/** Carries media already downloaded across a refresh, so a refetch does not redownload it. */
const preserveMedia = (previous, incoming) => {
    const loaded = new Map();
    previous.forEach(m => { if (m.mediaBase64) loaded.set(m.externalMessageId, m); });
    if (loaded.size === 0) return incoming;
    return incoming.map(m => {
        const had = loaded.get(m.externalMessageId);
        if (!had) return m;
        return {
            ...m,
            mediaBase64: had.mediaBase64,
            mediaMime: m.mediaMime || had.mediaMime,
            fileName: m.fileName || had.fileName,
            duration: m.duration || had.duration,
        };
    });
};

const ChatWindow = ({ chat, onClose, contactName, linkedIdentities, accountLabels,
                     onOpenLinked, onAnalyse }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sending, setSending] = useState(false);
    const [userStatus, setUserStatus] = useState(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [replyingTo, setReplyingTo] = useState(null);
    const [actionError, setActionError] = useState('');
    /**
     * A picked file waits here until the user confirms it.
     *
     * Choosing a file used to send it on the spot, straight out of the OS dialog: no look at
     * what was actually picked, no chance to add a caption, and no way back from a misclick
     * in a chat where the message is already delivered.
     */
    const [pending, setPending] = useState(null);
    /** Which photo the full-size viewer is showing, as an index into `photos`. */
    const [viewerIndex, setViewerIndex] = useState(null);
    /**
     * Voice transcripts for this chat, by the messenger's own message id.
     *
     * Kept beside the messages rather than merged into them: the live copy is refetched
     * constantly and would drop anything written into it, while an id-keyed map survives
     * every refresh, cache hit and archive replacement.
     */
    const [transcripts, setTranscripts] = useState({});
    /**
     * A reply the model wrote and the user has not decided on yet.
     *
     * `text` is kept alongside the draft so an edit can be told from an acceptance: sending
     * the words as generated and sending them after rewriting are different outcomes, and
     * the difference is the only measure of whether the model is any good here.
     */
    const [draft, setDraft] = useState(null);
    const recorder = useVoiceRecorder();
    const fileInputRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const messagesContentRef = useRef(null);
    // Whether the view should follow the newest message. True until the user scrolls up,
    // which is the only thing that should ever stop it following.
    const stickToBottom = useRef(true);
    const pollingRef = useRef(null);
    const statusPollingRef = useRef(null);
    const isInitialLoad = useRef(false);
    const inputRef = useRef(null);
    /** Bumped on every chat switch so replies to a chat the user has left are discarded. */
    const requestSeq = useRef(0);
    const mediaQueue = useRef({ pending: [], active: 0 });

    useEffect(() => {
        if (!chat) return;
        setMessages([]); setOffset(0); setHasMore(true); setUserStatus(null);
        setReplyingTo(null);
        setPending(null);
        setActionError('');
        stickToBottom.current = true;
        // Opening a chat is nearly always the first half of writing in it — and after the
        // compose dialog it is literally the second step of one action.
        inputRef.current?.focus();
        loadMessages(); startPolling();
        if (chat.messengerType === 'TELEGRAM' && chat.chatType === 'PERSONAL') {
            loadUserStatus(); startStatusPolling();
        }
        return () => { stopPolling(); stopStatusPolling(); };
    }, [chat?.externalChatId]);

    /**
     * Looks for a suggestion for this chat.
     *
     * Polled rather than pushed: generation finishes tens of seconds after the message that
     * triggered it, long after any websocket frame the client already handled.
     */
    useEffect(() => {
        if (!chat?.id) return;
        let cancelled = false;

        const fetchDraft = async () => {
            try {
                const { data } = await autoReplyService.getDraft(chat.id);
                if (cancelled) return;
                // Never overwrites what the user is typing — a suggestion that clobbers a
                // half-written message is worse than no suggestion.
                setDraft(current => (data?.id && (!current || current.id !== data.id) ? data : current));
            } catch { /* suggestions are optional; the chat works without them */ }
        };

        fetchDraft();
        const timer = setInterval(fetchDraft, 15000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [chat?.id]);

    // Clearing on a chat switch, so a suggestion never follows the user into another chat.
    useEffect(() => { setDraft(null); }, [chat?.externalChatId]);

    /**
     * Loads whatever has been transcribed for this chat.
     *
     * Polled slowly rather than once: transcription runs in the background, so a voice note
     * opened now may only get its text a minute later — and the user should see it appear
     * without reopening the chat.
     */
    useEffect(() => {
        if (!chat?.messengerAccountId || !chat?.externalChatId) return;
        let cancelled = false;
        setTranscripts({});

        const fetchTranscripts = async () => {
            try {
                const { data } = await archiveService.getTranscripts(
                    chat.messengerAccountId, chat.externalChatId);
                if (!cancelled) setTranscripts(data || {});
            } catch { /* voice notes simply stay untranscribed */ }
        };

        // Fetched once, not polled: transcripts now appear only when the user presses the
        // button on a clip, and that path returns the text directly. Polling would be a
        // request a minute asking about something that cannot change on its own.
        fetchTranscripts();
        return () => { cancelled = true; };
    }, [chat?.messengerAccountId, chat?.externalChatId]);

    // The suggestion lands in the composer, where Enter already means send. Only into an
    // empty one: whatever the user has started writing outranks anything generated.
    useEffect(() => {
        if (draft?.text && !newMessage.trim()) setNewMessage(draft.text);
    }, [draft?.id]);

    const dismissDraft = () => {
        if (!draft) return;
        autoReplyService.resolveDraft(draft.id, 'REJECTED').catch(() => {});
        if (newMessage.trim() === draft.text.trim()) setNewMessage('');
        setDraft(null);
    };

    useEffect(() => {
        if (isInitialLoad.current && messages.length > 0) {
            // Jump, never animate. A smooth scroll across fifty messages takes long enough
            // that the lazily-loaded media lands mid-flight, and a scroll animation is
            // abandoned the moment the content under it changes height — which is exactly
            // how opening a chat left the view stranded in the middle.
            scrollToBottom({ smooth: false });
            isInitialLoad.current = false;
        }
    }, [messages]);

    /**
     * Keeps the newest message in view while the content is still settling.
     *
     * Images and voice notes arrive after the messages do and have no reserved height, so
     * the bottom of the list keeps moving down for a second or two after the initial jump.
     * Re-pinning on every growth is what makes "open a chat" reliably land at the end.
     */
    useEffect(() => {
        const content = messagesContentRef.current;
        if (!content) return;
        const observer = new ResizeObserver(() => {
            if (stickToBottom.current) scrollToBottom({ smooth: false });
        });
        observer.observe(content);
        return () => observer.disconnect();
    }, [chat?.externalChatId, loading, messages.length === 0]);

    useEffect(() => {
        if (user) websocketService.connect(handleNewMessage);
        return () => websocketService.disconnect();
    }, [user]);

    // An object URL pins its blob in memory until revoked. Cleaning up when the staged file
    // is replaced, cleared, or the window closes keeps a session of browsing photos from
    // holding every one of them.
    useEffect(() => {
        const url = pending?.url;
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [pending]);

    /** Keeps the session cache current, so returning to this chat needs no request. */
    useEffect(() => {
        if (!chat || messages.length === 0) return;
        const key = chatKey(chat);
        MESSAGE_CACHE.delete(key); // re-insert so the eviction order is least-recent-first
        MESSAGE_CACHE.set(key, withoutMedia(messages));
        while (MESSAGE_CACHE.size > CACHE_LIMIT) {
            MESSAGE_CACHE.delete(MESSAGE_CACHE.keys().next().value);
        }
    }, [messages, chat?.externalChatId]);

    /**
     * The WebSocket already pushes anything the archiver stores, so this poll is a safety
     * net rather than the delivery path. At three seconds it re-pulled fifty messages from
     * Telegram twenty times a minute per open chat, competing with the fetches the user was
     * actually waiting on.
     */
    const startPolling = () => { stopPolling(); pollingRef.current = setInterval(pollNewMessages, 12000); };
    const stopPolling = () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
    const startStatusPolling = () => { stopStatusPolling(); statusPollingRef.current = setInterval(loadUserStatus, 30000); };
    const stopStatusPolling = () => { if (statusPollingRef.current) { clearInterval(statusPollingRef.current); statusPollingRef.current = null; } };

    const loadUserStatus = async () => {
        try { setUserStatus(await telegramService.getUserStatus(chat.externalChatId, chat.messengerAccountId)); } catch {}
    };

    /** Queues attachments instead of requesting them all at once. */
    const lazyLoadMedia = (msgs, seq) => {
        if (chat.messengerType !== 'TELEGRAM') return;
        const needed = (msgs || []).filter(m => m.mediaType && !m.mediaBase64 && m.externalMessageId);
        if (!needed.length) return;
        // Newest first: those are the ones actually on screen when the chat opens.
        mediaQueue.current.pending.push(...needed.slice().reverse());
        pumpMediaQueue(seq);
    };

    const pumpMediaQueue = (seq) => {
        const queue = mediaQueue.current;
        while (queue.active < MEDIA_CONCURRENCY && queue.pending.length > 0) {
            const msg = queue.pending.shift();
            queue.active++;
            telegramService.getMessageMedia(chat.externalChatId, msg.externalMessageId, chat.messengerAccountId)
                .then(r => {
                    if (seq !== requestSeq.current || !r?.media_base64) return;
                    setMessages(prev => prev.map(m =>
                        m.externalMessageId === msg.externalMessageId
                            ? { ...m, mediaBase64: r.media_base64, mediaMime: r.media_mime || m.mediaMime, fileName: r.file_name || m.fileName, duration: r.duration || m.duration }
                            : m
                    ));
                })
                .catch(() => {})
                .finally(() => {
                    queue.active--;
                    if (seq === requestSeq.current) pumpMediaQueue(seq);
                });
        }
    };

    const fetchLiveMessages = () => {
        if (chat.messengerType === 'TELEGRAM') return telegramService.getChatMessages(chat.externalChatId, 50, 0, chat.messengerAccountId);
        if (chat.messengerType === 'SLACK') return slackService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
        if (chat.messengerType === 'DISCORD') return discordService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
        if (chat.messengerType === 'WHATSAPP') return whatsappService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
        if (chat.messengerType === 'VIBER') return viberService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
        return Promise.resolve([]);
    };

    /**
     * Opens a chat in three stages, each faster than the one it falls back to.
     *
     * The messenger API is seconds away and used to be the only source, so every switch
     * showed a spinner for as long as Telegram took to answer. Now the session cache and
     * then the local archive render first, and the live fetch only reconciles what is
     * already on screen.
     */
    const loadMessages = async () => {
        const seq = ++requestSeq.current;
        mediaQueue.current.pending = [];
        isInitialLoad.current = true;
        let rendered = false;

        const cached = MESSAGE_CACHE.get(chatKey(chat));
        if (cached?.length) {
            setMessages(cached);
            setLoading(false);
            rendered = true;
        } else {
            setLoading(true);
            try {
                const archived = await archiveService.getMessages(
                    chat.messengerAccountId, chat.externalChatId, 50);
                if (seq !== requestSeq.current) return;
                if (archived?.length) {
                    setMessages(archived);
                    setLoading(false);
                    rendered = true;
                }
            } catch { /* the live fetch below is still coming */ }
        }

        try {
            const data = await fetchLiveMessages();
            if (seq !== requestSeq.current) return;
            // An empty live answer does not disprove the history already on screen — a
            // messenger that momentarily returns nothing should not blank the chat.
            if ((!data || data.length === 0) && rendered) return;
            setMessages(prev => preserveMedia(prev, data || []));
            setOffset(50);
            if (!data || data.length < 50) setHasMore(false);
            lazyLoadMedia(data || [], seq);
        } catch {
            // Whatever was rendered from cache or archive stays; it is real history.
            if (!rendered && seq === requestSeq.current) setMessages([]);
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    };

    const loadMoreMessages = async () => {
        if (loadingMore || !hasMore || chat.messengerType !== 'TELEGRAM') return;
        setLoadingMore(true);
        // Reading history is the opposite of following the newest message; without this the
        // observer below would haul the view back down as the older page is prepended.
        stickToBottom.current = false;
        const container = messagesContainerRef.current;
        const prevH = container?.scrollHeight || 0;
        try {
            const older = await telegramService.getChatMessages(chat.externalChatId, 50, offset, chat.messengerAccountId);
            if (!older?.length) { setHasMore(false); return; }
            setOffset(p => p + 50);
            setMessages(prev => {
                const ids = new Set(prev.map(m => m.externalMessageId));
                return [...older.filter(m => !ids.has(m.externalMessageId)), ...prev];
            });
            if (older.length < 50) setHasMore(false);
            requestAnimationFrame(() => { if (container) container.scrollTop = container.scrollHeight - prevH; });
            lazyLoadMedia(older, requestSeq.current);
        } catch {} finally { setLoadingMore(false); }
    };

    const pollNewMessages = async () => {
        try {
            let fresh;
            if (chat.messengerType === 'TELEGRAM') fresh = await telegramService.getChatMessages(chat.externalChatId, 50, 0, chat.messengerAccountId);
            else if (chat.messengerType === 'SLACK') fresh = await slackService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
            else if (chat.messengerType === 'DISCORD') fresh = await discordService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
            else if (chat.messengerType === 'WHATSAPP') fresh = await whatsappService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
            else if (chat.messengerType === 'VIBER') fresh = await viberService.getChatMessages(chat.externalChatId, chat.messengerAccountId);
            if (!fresh?.length) return;
            setMessages(prev => {
                const ids = new Set(prev.map(m => m.externalMessageId || m.id));
                const newOnes = fresh.filter(m => !ids.has(m.externalMessageId || m.id));
                if (!newOnes.length) return prev;
                newOnes
                    .filter(m => !m.isFromUser)
                    .forEach(m => {
                        notificationService.showMessage(
                            chat.name,
                            m.text || '📎 Media',
                            chat.messengerType
                        );
                    });
                lazyLoadMedia(newOnes, requestSeq.current);
                // No scrolling here: the observer pins the view when the list grows, and it
                // does so after the new rows are actually laid out rather than on a timer.
                return [...prev, ...newOnes];
            });
        } catch {}
    };

    const handleNewMessage = (msg) => {
        if (msg.chatId === chat?.id)
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    };

    /**
     * Drives the scroll container directly rather than calling scrollIntoView on a marker.
     * scrollIntoView also scrolls every scrollable ancestor and needs the marker to be laid
     * out; setting scrollTop cannot miss.
     */
    const scrollToBottom = ({ smooth = true } = {}) => {
        const c = messagesContainerRef.current;
        if (!c) return;
        if (smooth) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
        else c.scrollTop = c.scrollHeight;
    };
    const handleReply = (message) => { setReplyingTo(message); inputRef.current?.focus(); };
    const handleCancelReply = () => setReplyingTo(null);

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;
        setSending(true);
        const text = newMessage;
        const usedDraft = draft && newMessage.trim() === draft.text.trim() ? 'SENT'
            : draft ? 'SENT_EDITED' : null;
        const replyId = replyingTo?.externalMessageId || null;
        setNewMessage('');
        setReplyingTo(null);
        inputRef.current?.focus();
        // Sending is a deliberate return to the end of the conversation, even if the user
        // had scrolled back through history to write it.
        stickToBottom.current = true;
        try {
            if (chat.messengerType === 'TELEGRAM')
                await telegramService.sendMessage(chat.externalChatId, text, replyId, chat.messengerAccountId);
            else if (chat.messengerType === 'SLACK')
                await slackService.sendMessage(chat.externalChatId, text, chat.messengerAccountId);
            else if (chat.messengerType === 'DISCORD')
                await discordService.sendMessage(chat.externalChatId, text, chat.messengerAccountId);
            else if (chat.messengerType === 'WHATSAPP')
                await whatsappService.sendMessage(chat.externalChatId, text, chat.messengerAccountId);
            else if (chat.messengerType === 'VIBER')
                await viberService.sendMessage(chat.externalChatId, text, chat.messengerAccountId);
            if (usedDraft) {
                autoReplyService.resolveDraft(draft.id, usedDraft).catch(() => {});
                setDraft(null);
            }
            setTimeout(pollNewMessages, 600);
        } catch { setNewMessage(text); } finally { setSending(false); }
    };


    const handleDelete = async (message) => {
        if (!SUPPORTS_DELETE[chat.messengerType]) {
            setActionError('Viber не дозволяє видаляти надіслані повідомлення');
            return;
        }
        if (!window.confirm('Видалити повідомлення?')) return;
        try {
            // Routed by the chat's own network. This used to call Telegram for every
            // messenger, so deleting a Slack message asked Telegram to remove an id it
            // had never heard of.
            const service = serviceFor(chat.messengerType);
            if (chat.messengerType === 'TELEGRAM') {
                await service.deleteMessage(
                    chat.externalChatId, message.externalMessageId, true, chat.messengerAccountId);
            } else {
                await service.deleteMessage(
                    chat.externalChatId, message.externalMessageId, chat.messengerAccountId);
            }
            setMessages(prev =>
                prev.filter(m => m.externalMessageId !== message.externalMessageId)
            );
            setActionError('');
        } catch (e) {
            setActionError(e.response?.data?.error || 'Не вдалося видалити повідомлення');
        }
    };

    /** Reads a file or recording into the base64 the backend expects. */
    const toBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result);
            resolve(result.slice(result.indexOf('base64,') + 'base64,'.length));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    const sendAttachment = async ({ blob, fileName, kind, durationSeconds }) => {
        if (!SUPPORTS_MEDIA[chat.messengerType]) {
            setActionError('Viber не приймає вкладення через API бота');
            return;
        }
        setSending(true);
        setActionError('');
        try {
            await serviceFor(chat.messengerType).sendMedia({
                chatId: chat.externalChatId,
                dataBase64: await toBase64(blob),
                mimeType: blob.type || 'application/octet-stream',
                fileName,
                kind,
                durationSeconds,
                caption: newMessage.trim() || null,
                replyToMessageId: replyingTo?.externalMessageId || null,
            }, chat.messengerAccountId);

            setNewMessage('');
            setReplyingTo(null);
            setTimeout(pollNewMessages, 800);
            return true;
        } catch (e) {
            // Reported, not thrown: the caller keeps the staged file so the user can retry
            // instead of having to pick it again.
            setActionError(e.response?.data?.error || 'Не вдалося надіслати вкладення');
            return false;
        } finally {
            setSending(false);
        }
    };

    const handleFilePicked = (event) => {
        const file = event.target.files?.[0];
        // Reset immediately, or picking the same file twice in a row fires no change event.
        event.target.value = '';
        if (!file) return;

        const kind = file.type.startsWith('image/') ? 'IMAGE'
            : file.type.startsWith('video/') ? 'VIDEO'
            : file.type.startsWith('audio/') ? 'AUDIO' : 'FILE';

        setActionError('');
        setPending({
            file,
            fileName: file.name,
            kind,
            // Only what can actually be shown gets an object URL; the rest is described
            // by name and size, which is all a document has to offer anyway.
            url: kind === 'IMAGE' || kind === 'VIDEO' ? URL.createObjectURL(file) : null,
        });
        // The caption field is the same box as the message field, so put the cursor there.
        inputRef.current?.focus();
    };

    const sendPending = async () => {
        if (!pending) return;
        const sent = await sendAttachment({
            blob: pending.file,
            fileName: pending.fileName,
            kind: pending.kind,
        });
        if (sent) setPending(null);
    };

    /** One key and one button for both, so the primary action is never ambiguous. */
    const handleComposerSend = () => (pending ? sendPending() : handleSendMessage());

    const handleMicClick = async () => {
        if (!recorder.isRecording) {
            await recorder.start();
            return;
        }
        const recording = await recorder.stop();
        if (!recording) return;
        await sendAttachment({
            blob: recording.blob,
            fileName: 'voice',
            kind: 'VOICE',
            durationSeconds: recording.seconds,
        });
    };

    /**
     * Every photo already downloaded in this conversation, oldest first.
     *
     * Only loaded ones: media arrives through a throttled queue, and offering to page into
     * a picture whose bytes have not arrived would show an empty frame.
     */
    const photos = messages
        .filter(m => m.mediaType === 'photo' && m.mediaBase64)
        .map(m => ({
            key: m.externalMessageId,
            src: `data:${m.mediaMime};base64,${m.mediaBase64}`,
            fileName: m.fileName,
            timestamp: m.timestamp,
            senderName: m.isFromUser ? 'Ви' : (m.senderName || chat?.name),
        }));

    const openPhoto = (message) => {
        const index = photos.findIndex(photo => photo.key === message.externalMessageId);
        if (index >= 0) setViewerIndex(index);
    };

    if (!chat) return null;

    return (
        <Box sx={(t) => ({ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: t.c.bg, overflow: 'hidden', position: 'relative' })}>
            <Box sx={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.4, backgroundImage: 'radial-gradient(#d4c9bc 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

            {viewerIndex != null && photos[viewerIndex] && (
                <MediaViewer
                    items={photos}
                    index={viewerIndex}
                    onIndex={setViewerIndex}
                    onClose={() => setViewerIndex(null)}
                />
            )}

            <ChatHeader
                chat={chat}
                userStatus={userStatus}
                onClose={onClose}
                contactName={contactName}
                linkedIdentities={linkedIdentities}
                accountLabels={accountLabels}
                onOpenLinked={onOpenLinked}
                onAnalyse={onAnalyse}
            />

            <Box
                ref={messagesContainerRef}
                onScroll={e => {
                    const c = e.currentTarget;
                    // Scrolling up is the user taking over; anything within a screen-inch of
                    // the end still counts as following the conversation.
                    stickToBottom.current = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
                    if (c.scrollTop < 80) loadMoreMessages();
                }}
                sx={{ flexGrow: 1, overflow: 'auto', px: 3, py: 2, zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'var(--c-border-strong)', borderRadius: '4px' } }}
            >
                {loading ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <CircularProgress size={20} sx={{ mb: 1.5 }} />
                            <Typography sx={(t) => ({ color: t.c.textFaint, fontSize: 13 })}>Завантаження повідомлень…</Typography>
                        </Box>
                    </Box>
                ) : messages.length === 0 ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 40, mb: 2, opacity: 0.3 }}>✉️</Typography>
                            <Typography sx={(t) => ({ color: t.c.textMuted, fontSize: 14, fontWeight: 650 })}>Повідомлень ще немає</Typography>
                            <Typography sx={(t) => ({ color: t.c.textFaint, fontSize: 12, mt: 0.5 })}>Напишіть перше повідомлення</Typography>
                        </Box>
                    </Box>
                ) : (
                    <Box ref={messagesContentRef}>
                        {loadingMore && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                <CircularProgress size={16} />
                            </Box>
                        )}
                        {!hasMore && (
                            <Box sx={{ textAlign: 'center', py: 2 }}>
                                <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint })}>Початок розмови</Typography>
                            </Box>
                        )}
                        {messages.map((msg, i) => {
                            const showDate = i === 0 || new Date(messages[i - 1].timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
                            /**
                             * Consecutive messages from one person are one turn, drawn as one.
                             *
                             * Five lines typed in a row used to repeat the avatar five times
                             * and space themselves as if five people had spoken. The avatar
                             * belongs to the last line of a run — that is where the eye
                             * expects the speaker to be, next to where the run ends.
                             */
                            const previous = messages[i - 1];
                            const runStarts = showDate || !previous
                                || previous.isFromUser !== msg.isFromUser
                                || previous.senderName !== msg.senderName;
                            const next = messages[i + 1];
                            const runEnds = !next
                                || next.isFromUser !== msg.isFromUser
                                || next.senderName !== msg.senderName
                                || new Date(next.timestamp).toDateString()
                                    !== new Date(msg.timestamp).toDateString();
                            return (
                                <Box key={msg.externalMessageId || msg.id || i}>
                                    {showDate && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 2.5 }}>
                                            <Box sx={(t) => ({ flex: 1, height: 1, bgcolor: t.c.border })} />
                                            <Typography sx={(t) => ({ fontSize: 10, color: t.c.textFaint, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: 999, px: 1.25, py: 0.35 })}>
                                                {formatDayLabel(msg.timestamp)}
                                            </Typography>
                                            <Box sx={{ flex: 1, height: 1, bgcolor: '#e4ddd4' }} />
                                        </Box>
                                    )}
                                    <MessageBubble message={msg} chat={chat} onReply={handleReply}
                                                  onDelete={handleDelete} onOpenMedia={openPhoto}
                                                  runEnds={runEnds} runStarts={runStarts}
                                                  transcript={transcripts[msg.externalMessageId]} />
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>

            {/* Відповідь + поле введення */}
            <Box sx={(t) => ({ bgcolor: t.c.surfaceAlt, borderTop: `1px solid ${t.c.border}`, zIndex: 10, flexShrink: 0 })}>
                {draft && (
                    <Box sx={(t) => ({
                        px: 2.5, pt: 1.5, pb: 0.5,
                        display: 'flex', alignItems: 'center', gap: 1,
                    })}>
                        <AutoAwesomeIcon sx={(t) => ({ fontSize: 14, color: t.c.accentText, flexShrink: 0 })} />
                        <Typography sx={(t) => ({ fontSize: 11, fontWeight: 650, color: t.c.accentText })}>
                            Чернетка від моделі
                        </Typography>
                        <Typography sx={(t) => ({ ...numeric, fontSize: 10.5, color: t.c.textFaint })}>
                            {[draft.model, draft.modelMs && `${Math.round(draft.modelMs / 1000)} с`]
                                .filter(Boolean).join(' · ')}
                        </Typography>
                        <Box sx={{ flex: 1 }} />
                        <Typography
                            onClick={dismissDraft}
                            sx={(t) => ({
                                fontSize: 11, fontWeight: 600, color: t.c.textMuted, cursor: 'pointer',
                                '&:hover': { color: t.c.danger },
                            })}
                        >
                            Прибрати
                        </Typography>
                    </Box>
                )}

                {replyingTo && (
                    <Box sx={{ px: 2.5, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={(t) => ({ flex: 1, pl: 1.25, py: 0.55, pr: 1, borderLeft: `2px solid ${t.c.accent}`, bgcolor: t.c.accentSoft, borderRadius: '0 6px 6px 0', minWidth: 0 })}>
                            <Typography sx={(t) => ({ fontSize: 11, fontWeight: 700, color: t.c.accentText })}>
                                {replyingTo.isFromUser ? 'Ви' : (replyingTo.senderName || chat.name)}
                            </Typography>
                            <Typography noWrap sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                                {replyingTo.text || '📎 Медіа'}
                            </Typography>
                        </Box>
                        <Box onClick={handleCancelReply} sx={(t) => ({ cursor: 'pointer', color: t.c.textFaint, display: 'flex', flexShrink: 0, p: 0.5, borderRadius: '50%', '&:hover': { color: t.c.accentText, bgcolor: t.c.accentSoft }, transition: 'all .12s' })}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                        </Box>
                    </Box>
                )}
                {pending && (
                    <Box sx={(t) => ({
                        mx: 2.5, mt: 1.5, p: 1, display: 'flex', alignItems: 'center', gap: 1.5,
                        bgcolor: t.c.surface, border: `1px solid ${t.c.border}`,
                        borderRadius: `${radius.lg}`,
                    })}>
                        {pending.url && pending.kind === 'IMAGE' && (
                            <Box component="img" src={pending.url} alt=""
                                 sx={{ width: 52, height: 52, objectFit: 'cover', borderRadius: `${radius.md}`, flexShrink: 0 }} />
                        )}
                        {pending.url && pending.kind === 'VIDEO' && (
                            <Box component="video" src={pending.url} muted
                                 sx={{ width: 52, height: 52, objectFit: 'cover', borderRadius: `${radius.md}`, flexShrink: 0, bgcolor: '#000' }} />
                        )}
                        {!pending.url && (
                            <Box sx={(t) => ({
                                width: 52, height: 52, flexShrink: 0, borderRadius: `${radius.md}`,
                                bgcolor: t.c.surfaceSunken, color: t.c.textMuted,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            })}>
                                <AttachFileIcon sx={{ fontSize: 20 }} />
                            </Box>
                        )}

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={(t) => ({ fontSize: 12.5, fontWeight: 650, color: t.c.text })}>
                                {pending.fileName}
                            </Typography>
                            <Typography sx={(t) => ({ ...numeric, fontSize: 11, color: t.c.textFaint })}>
                                {KIND_LABELS[pending.kind]} · {formatBytes(pending.file.size)}
                                {newMessage.trim() ? ' · з підписом' : ''}
                            </Typography>
                        </Box>

                        <Box onClick={() => !sending && setPending(null)}
                             title="Прибрати вкладення"
                             sx={(t) => ({
                                 cursor: sending ? 'default' : 'pointer', color: t.c.textFaint,
                                 display: 'flex', flexShrink: 0, p: 0.5, borderRadius: '50%',
                                 '&:hover': sending ? {} : { color: t.c.danger, bgcolor: t.c.accentSoft },
                                 transition: 'all .12s',
                             })}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                        </Box>
                    </Box>
                )}
                {(actionError || recorder.error) && (
                    <Box sx={{ px: 2.5, pt: 1 }}>
                        <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.danger })}>
                            ⚠ {actionError || recorder.error}
                        </Typography>
                    </Box>
                )}
                <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        hidden
                        onChange={handleFilePicked}
                    />
                    <IconButton
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending || recorder.isRecording || !SUPPORTS_MEDIA[chat.messengerType]}
                        title={SUPPORTS_MEDIA[chat.messengerType] ? 'Прикріпити файл' : 'Viber не приймає вкладення'}
                        sx={(t) => ({ width: 40, height: 40, flexShrink: 0, borderRadius: `${radius.md}`, '&:disabled': { color: t.c.border } })}>
                        <AttachFileIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    {recorder.isRecording ? (
                        /* While recording the text box is meaningless, so it gives way to
                           the elapsed time and an explicit way out that discards the take. */
                        <Box sx={(t) => ({ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: t.c.accentSoft, border: `1px solid ${t.c.accent}`, borderRadius: `${radius.lg}`, px: 2, py: 1.3 })}>
                            <Box sx={(t) => ({ width: 8, height: 8, borderRadius: '50%', bgcolor: t.c.accentText, animation: 'pulse 1.2s ease-in-out infinite', '@keyframes pulse': { '50%': { opacity: 0.25 } } })} />
                            <Typography sx={(t) => ({ ...numeric, fontSize: 13, fontWeight: 700, color: t.c.accentText })}>
                                {String(Math.floor(recorder.seconds / 60)).padStart(2, '0')}:{String(recorder.seconds % 60).padStart(2, '0')}
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                            <Typography
                                onClick={() => recorder.cancel()}
                                sx={(t) => ({ fontSize: 12, fontWeight: 600, color: t.c.textMuted, cursor: 'pointer', '&:hover': { color: t.c.accentText } })}>
                                Скасувати
                            </Typography>
                        </Box>
                    ) : (
                    <Box sx={(t) => ({ flex: 1, bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: `${radius.lg}`, px: 1.75, py: 1, transition: 'border-color .12s', '&:focus-within': { borderColor: t.c.borderStrong } })}>
                        <textarea
                            ref={inputRef}
                            placeholder={pending ? 'Підпис до вкладення (необов’язково)…' : 'Введіть повідомлення...'}
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComposerSend(); } }}
                            disabled={sending}
                            rows={1}
                            style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', resize: 'none', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}
                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                        />
                    </Box>
                    )}

                    {/* The microphone gives way to the send button once there is text to
                        send, so the primary action is never ambiguous. */}
                    {(newMessage.trim() || pending) && !recorder.isRecording ? (
                        <IconButton onClick={handleComposerSend} disabled={sending} sx={(t) => ({ width: 44, height: 44, flexShrink: 0, bgcolor: t.c.accentText, color: t.c.onAccent, borderRadius: `${radius.md}`, transition: 'background-color .12s', '&:hover': { bgcolor: t.c.accentHover, color: t.c.onAccent }, '&:disabled': { bgcolor: t.c.surfaceSunken, color: t.c.textFaint } })}>
                            <SendIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    ) : (
                        <IconButton
                            onClick={handleMicClick}
                            disabled={sending || !SUPPORTS_MEDIA[chat.messengerType]}
                            title={recorder.isRecording ? 'Надіслати голосове' : 'Записати голосове'}
                            sx={(t) => ({ width: 44, height: 44, flexShrink: 0, bgcolor: recorder.isRecording ? t.c.accent : t.c.surfaceSunken, color: recorder.isRecording ? t.c.onAccent : t.c.textMuted, borderRadius: `${radius.md}`, transition: 'background-color .12s', '&:hover': { bgcolor: recorder.isRecording ? t.c.accentHover : t.c.surfaceActive }, '&:disabled': { bgcolor: t.c.surfaceSunken, color: t.c.textFaint } })}>
                            {recorder.isRecording
                                ? <StopCircleIcon sx={{ fontSize: 20 }} />
                                : <MicIcon sx={{ fontSize: 19 }} />}
                        </IconButton>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default ChatWindow;