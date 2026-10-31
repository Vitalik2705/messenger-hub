import { useState, useEffect, useRef } from 'react';
import { Box, Typography, IconButton, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import MediaViewer from './MediaViewer';
import ProfilePanel from './ProfilePanel';
import ChatSearchBar from './ChatSearchBar';
import EmojiPicker from './EmojiPicker';
import { CatchUpBanner, ReplySuggestions } from './AssistBits';
import MessageMenu from './MessageMenu';
import { QuoteBanner, DraftBanner, PendingAttachment } from './ComposerBanners';
import { DayDivider, UnreadDivider, JumpToLatest, DropOverlay } from './ConversationMarks';
import SentimentSatisfiedAltOutlinedIcon from '@mui/icons-material/SentimentSatisfiedAltOutlined';
import { useToast } from '../../context/ToastContext';
import { usePresentation } from '../../context/PresentationContext';
import { plainText } from '../../utils/richText';
import websocketService from '../../services/websocketService';
import telegramService from '../../services/telegramService';
import slackService from '../../services/slackService';
import discordService from '../../services/discordService';
import whatsappService from '../../services/whatsappService';
import viberService from '../../services/viberService';
import notificationService from '../../services/notificationService';
import archiveService from '../../services/archiveService';
import autoReplyService from '../../services/autoReplyService';
import { serviceFor, SUPPORTS_MEDIA, SUPPORTS_DELETE } from '../../services/messengerServices';
import useVoiceRecorder from '../../hooks/useVoiceRecorder';
import { radius, numeric } from '../../theme/tokens';
import { formatDuration } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';

/**
 * Messages of chats opened this session, so switching back needs no request. Media is stripped
 * before caching to keep base64 out of memory; it is re-fetched through the media queue.
 */
const MESSAGE_CACHE = new Map();
const CACHE_LIMIT = 20;

/**
 * Media requests in flight at once. Telethon serialises them on one connection, so more parallelism
 * only delays the next chat's message fetch.
 */
const MEDIA_CONCURRENCY = 3;

const chatKey = (chat) => `${chat.messengerType}:${chat.messengerAccountId}:${chat.externalChatId}`;

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

/** From this many unread messages on, the chat offers a summary of what was missed. */
const CATCH_UP_FROM = 8;

const ChatWindow = ({ chat, onClose, contactName, linkedIdentities, accountLabels,
                     onOpenLinked, onAnalyse, onFindSimilar }) => {
    const { user } = useAuth();
    const toast = useToast();
    const { name: presentedName } = usePresentation();
    /** The message menu (right click or ⋯): where it opens and for which message. */
    const [menu, setMenu] = useState(null);
    /** An own message being edited in the composer. */
    const [editing, setEditing] = useState(null);
    /** Find in this chat (Ctrl+F). `index` points into the matches, oldest first. */
    const [chatSearch, setChatSearch] = useState({ open: false, query: '', index: 0 });
    /** A message that should pulse once — a search hit or a jump target. */
    const [flashKey, setFlashKey] = useState(null);
    const [typing, setTyping] = useState(false);
    const lastTypingSent = useRef(0);
    const [dragOver, setDragOver] = useState(false);
    const [emojiAnchor, setEmojiAnchor] = useState(null);
    /**
     * Unread count at the moment the chat opened, taken before the chat is marked read. Drives the
     * unread divider, the first scroll position and the catch-up offer.
     */
    const unreadAtOpen = useRef(0);
    const [firstUnreadKey, setFirstUnreadKey] = useState(null);
    const [catchUpOpen, setCatchUpOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sending, setSending] = useState(false);
    const [userStatus, setUserStatus] = useState(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [replyingTo, setReplyingTo] = useState(null);
    /**
     * A picked file waits here for confirmation, so it can be checked and captioned before sending.
     */
    const [pending, setPending] = useState(null);
    /** Which photo the full-size viewer is showing, as an index into `photos`. */
    const [viewerIndex, setViewerIndex] = useState(null);
    const [profileOpen, setProfileOpen] = useState(false);
    /** Scrolled away from the end, and how many messages arrived since. */
    const [awayFromEnd, setAwayFromEnd] = useState(false);
    const [unseen, setUnseen] = useState(0);
    const lastSeenKey = useRef(null);
    /**
     * Voice transcripts keyed by message id, kept apart from the messages so refetches do not drop
     * them.
     */
    const [transcripts, setTranscripts] = useState({});
    /**
     * A model-written reply awaiting the user's decision. The original text is kept so sending it
     * as-is can be told from sending an edited version.
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
        setEditing(null);
        setMenu(null);
        setChatSearch({ open: false, query: '', index: 0 });
        setTyping(false);
        unreadAtOpen.current = chat.unreadCount || 0;
        setFirstUnreadKey(null);
        setCatchUpOpen((chat.unreadCount || 0) >= CATCH_UP_FROM);
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
     * Polls for a reply suggestion: generation finishes long after the message that triggered it.
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

    /** "Typing…" for Telegram person chats — pushed by Telegram to the service, polled here. */
    useEffect(() => {
        if (chat?.messengerType !== 'TELEGRAM' || chat?.chatType !== 'PERSONAL') return undefined;
        let cancelled = false;
        const check = () => telegramService.isTyping(chat.externalChatId, chat.messengerAccountId)
            .then((r) => { if (!cancelled) setTyping(Boolean(r?.typing)); })
            .catch(() => {});
        const timer = setInterval(check, 3000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [chat?.externalChatId, chat?.messengerType, chat?.chatType, chat?.messengerAccountId]);

    /** Ctrl+F opens find-in-chat while a chat is open. */
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setChatSearch((s) => ({ ...s, open: true }));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Clearing on a chat switch, so a suggestion never follows the user into another chat.
    useEffect(() => { setDraft(null); }, [chat?.externalChatId]);

    /**
     * Polls this chat's transcripts, since transcription runs in the background and text can appear
     * a minute later.
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
            isInitialLoad.current = false;
            // With unread messages, open where they start — the way Telegram does — and
            // mark the place with a divider. Otherwise jump to the end.
            const unread = unreadAtOpen.current;
            if (unread > 0 && unread < messages.length) {
                const incoming = messages.filter(m => !m.isFromUser);
                const first = incoming[Math.max(0, incoming.length - unread)];
                const key = first && (first.externalMessageId || first.id);
                if (key) {
                    setFirstUnreadKey(key);
                    requestAnimationFrame(() => {
                        const c = messagesContainerRef.current;
                        const el = c?.querySelector(`[data-unread-divider]`);
                        if (c && el) {
                            stickToBottom.current = false;
                            c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - 24;
                        } else {
                            scrollToBottom({ smooth: false });
                        }
                    });
                    return;
                }
            }
            // Jump, never animate: a smooth scroll stops when media below changes height.
            scrollToBottom({ smooth: false });
        }
    }, [messages]);

    /** Keeps the newest message in view while images and voice notes load and grow the list. */
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

    /**
     * Counts messages arriving at the end while the reader is scrolled up, for the jump button's
     * badge.
     */
    useEffect(() => {
        const last = messages[messages.length - 1];
        const key = last ? (last.externalMessageId || last.id) : null;
        if (lastSeenKey.current && key && key !== lastSeenKey.current && awayFromEnd && !last.isFromUser) {
            setUnseen((n) => n + 1);
        }
        lastSeenKey.current = key;
    }, [messages, awayFromEnd]);

    useEffect(() => { setAwayFromEnd(false); setUnseen(0); setProfileOpen(false); lastSeenKey.current = null; }, [chat?.externalChatId]);

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

    /** A safety net: new messages normally arrive over the WebSocket, so this poll is slow. */
    const startPolling = () => { stopPolling(); pollingRef.current = setInterval(pollNewMessages, 12000); };
    const stopPolling = () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
    const startStatusPolling = () => { stopStatusPolling(); statusPollingRef.current = setInterval(loadUserStatus, 30000); };
    const stopStatusPolling = () => { if (statusPollingRef.current) { clearInterval(statusPollingRef.current); statusPollingRef.current = null; } };

    const loadUserStatus = async () => {
        try { setUserStatus(await telegramService.getUserStatus(chat.externalChatId, chat.messengerAccountId)); } catch { /* the header just shows no presence */ }
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
     * Opens a chat in three stages: session cache, then the local archive, then the messenger
     * itself, which only reconciles what is already on screen.
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
        } catch { /* scrolling up again retries */ } finally { setLoadingMore(false); }
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
                // Messages already on screen can change too: read ticks, reactions, edits.
                const freshById = new Map(fresh.map(m => [m.externalMessageId || m.id, m]));
                let changed = false;
                const updated = prev.map(m => {
                    const f = freshById.get(m.externalMessageId || m.id);
                    if (!f || (f.text === m.text && f.isRead === m.isRead && f.edited === m.edited
                        && JSON.stringify(f.reactions || null) === JSON.stringify(m.reactions || null))) return m;
                    changed = true;
                    return { ...m, text: f.text, isRead: f.isRead, edited: f.edited, reactions: f.reactions };
                });
                if (!newOnes.length) return changed ? updated : prev;
                prev = updated;
                newOnes
                    .filter(m => !m.isFromUser)
                    .forEach(m => {
                        notificationService.showMessage(
                            chat.name,
                            plainText(m.text) || t('📎 Медіа'),
                            chat.messengerType
                        );
                    });
                lazyLoadMedia(newOnes, requestSeq.current);
                // No scrolling here: the observer pins the view when the list grows, and it
                // does so after the new rows are actually laid out rather than on a timer.
                return [...prev, ...newOnes];
            });
        } catch { /* the next poll tries again */ }
    };

    const handleNewMessage = (msg) => {
        if (msg.chatId === chat?.id)
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    };

    /**
     * Sets scrollTop directly: scrollIntoView would also scroll ancestors and needs the target laid
     * out.
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
        if (editing) return saveEdit();
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
        } catch (e) {
            setNewMessage(text);
            toast(e.response?.data?.message || t('Не вдалося надіслати повідомлення'), 'error');
        } finally { setSending(false); }
    };

    const startEdit = (message) => {
        setEditing(message);
        setReplyingTo(null);
        setNewMessage(message.text || '');
        inputRef.current?.focus();
    };

    const cancelEdit = () => { setEditing(null); setNewMessage(''); };

    const saveEdit = async () => {
        const text = newMessage.trim();
        const target = editing;
        if (!text || !target) return;
        if (text === (target.text || '').trim()) { cancelEdit(); return; }
        setSending(true);
        try {
            await telegramService.editMessage(chat.externalChatId, target.externalMessageId, text, chat.messengerAccountId);
            setMessages(prev => prev.map(m => m.externalMessageId === target.externalMessageId ? { ...m, text, edited: true } : m));
            setEditing(null);
            setNewMessage('');
            toast(t('Повідомлення змінено'), 'success');
        } catch (e) {
            toast(e.response?.data?.message || t('Не вдалося змінити повідомлення'), 'error');
        } finally { setSending(false); }
    };

    const handleReact = async (message, emoji) => {
        if (chat.messengerType !== 'TELEGRAM') return;
        try {
            const r = await telegramService.react(chat.externalChatId, message.externalMessageId, emoji || '', chat.messengerAccountId);
            setMessages(prev => prev.map(m => m.externalMessageId === message.externalMessageId ? { ...m, reactions: r?.reactions || [] } : m));
        } catch (e) {
            toast(e.response?.data?.message || t('Реакцію не вдалося поставити'), 'error');
        }
    };

    /** Tells the other side "typing…", at most every four seconds. */
    const signalTyping = () => {
        if (chat.messengerType !== 'TELEGRAM' || chat.chatType !== 'PERSONAL') return;
        const now = Date.now();
        if (now - lastTypingSent.current < 4000) return;
        lastTypingSent.current = now;
        telegramService.sendTyping(chat.externalChatId, chat.messengerAccountId);
    };


    const handleDelete = async (message) => {
        if (!SUPPORTS_DELETE[chat.messengerType]) {
            toast(t('Viber не дозволяє видаляти надіслані повідомлення'), 'error');
            return;
        }
        if (!window.confirm(t('Видалити повідомлення?'))) return;
        try {
            // Routed to the chat's own network's service.
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
                    } catch (e) {
            toast(e.response?.data?.error || t('Не вдалося видалити повідомлення'), 'error');
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
            toast(t('Viber не приймає вкладення через API бота'), 'error');
            return;
        }
        setSending(true);
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
            toast(e.response?.data?.error || t('Не вдалося надіслати вкладення'), 'error');
            return false;
        } finally {
            setSending(false);
        }
    };

    const handleFilePicked = (event) => {
        const file = event.target.files?.[0];
        // Reset immediately, or picking the same file twice in a row fires no change event.
        event.target.value = '';
        stageFile(file);
    };

    /** Stages a file from the picker, a paste, or a drop — all three end up here. */
    const stageFile = (file) => {
        if (!file) return;
        if (!SUPPORTS_MEDIA[chat.messengerType]) {
            toast(t('Ця мережа не приймає вкладення'), 'error');
            return;
        }

        const kind = file.type.startsWith('image/') ? 'IMAGE'
            : file.type.startsWith('video/') ? 'VIDEO'
            : file.type.startsWith('audio/') ? 'AUDIO' : 'FILE';

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

    /** Photos already downloaded in this chat, oldest first, for the full-size viewer. */
    const photos = messages
        .filter(m => m.mediaType === 'photo' && m.mediaBase64)
        .map(m => ({
            key: m.externalMessageId,
            src: `data:${m.mediaMime};base64,${m.mediaBase64}`,
            fileName: m.fileName,
            timestamp: m.timestamp,
            senderName: m.isFromUser ? t('Ви') : (m.senderName || chat?.name),
        }));

    const openPhoto = (message) => {
        const index = photos.findIndex(photo => photo.key === message.externalMessageId);
        if (index >= 0) setViewerIndex(index);
    };

    /** Find in chat: messages whose text contains the query, oldest first. */
    const searchQuery = chatSearch.open && chatSearch.query.trim().length >= 2 ? chatSearch.query.trim().toLowerCase() : '';
    const searchMatches = searchQuery
        ? messages.filter(m => m.text && plainText(m.text).toLowerCase().includes(searchQuery)).map(m => m.externalMessageId || m.id)
        : [];

    const jumpTo = (key) => {
        const c = messagesContainerRef.current;
        const el = c?.querySelector(`[data-msg="${CSS.escape(String(key))}"]`);
        if (!c || !el) return;
        stickToBottom.current = false;
        c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - c.clientHeight / 2 + el.offsetHeight / 2;
        setFlashKey(key);
        setTimeout(() => setFlashKey((k) => (k === key ? null : k)), 1700);
    };

    const stepSearch = (delta) => {
        if (!searchMatches.length) return;
        setChatSearch((s) => {
            const index = (s.index + delta + searchMatches.length) % searchMatches.length;
            requestAnimationFrame(() => jumpTo(searchMatches[index]));
            return { ...s, index };
        });
    };

    const setSearchQuery = (query) => {
        const q = query.trim().toLowerCase();
        const matches = q.length >= 2
            ? messages.filter(m => m.text && plainText(m.text).toLowerCase().includes(q)).map(m => m.externalMessageId || m.id)
            : [];
        const index = Math.max(0, matches.length - 1);
        setChatSearch({ open: true, query, index });
        if (matches.length) requestAnimationFrame(() => jumpTo(matches[index]));
    };

    const copyText = (message) => {
        navigator.clipboard?.writeText(plainText(message.text) || '');
        toast(t('Текст скопійовано'), 'success');
    };

    const insertEmoji = (emoji) => {
        const el = inputRef.current;
        const start = el?.selectionStart ?? newMessage.length;
        const end = el?.selectionEnd ?? newMessage.length;
        setNewMessage(newMessage.slice(0, start) + emoji + newMessage.slice(end));
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(start + emoji.length, start + emoji.length);
        });
    };

    const lastMessage = messages[messages.length - 1];
    const offerReplies = lastMessage && !lastMessage.isFromUser && lastMessage.text && !editing && !pending && !newMessage.trim();
    const unreadSlice = firstUnreadKey
        ? messages.slice(Math.max(0, messages.findIndex(m => (m.externalMessageId || m.id) === firstUnreadKey)))
        : messages.slice(-Math.max(unreadAtOpen.current, 1));
    const menuMessage = menu?.message;
    const canEditMenu = menuMessage && chat.messengerType === 'TELEGRAM' && menuMessage.isFromUser
        && menuMessage.text && (!menuMessage.mediaType || menuMessage.mediaType === 'webpage');

    if (!chat) return null;

    return (
        <Box
            onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (!dragOver) setDragOver(true); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
            onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); setDragOver(false); stageFile(e.dataTransfer.files[0]); } }}
            sx={(t) => ({ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: t.c.bg, overflow: 'hidden', position: 'relative' })}>
            {dragOver && <DropOverlay />}

            <MessageMenu
                anchor={menu}
                onClose={() => setMenu(null)}
                canReact={chat.messengerType === 'TELEGRAM'}
                canEdit={canEditMenu}
                canDelete={Boolean(menuMessage?.isFromUser && SUPPORTS_DELETE[chat.messengerType])}
                onReact={handleReact}
                onReply={handleReply}
                onCopy={copyText}
                onEdit={startEdit}
                onFindSimilar={onFindSimilar && ((m) => onFindSimilar(plainText(m.text)))}
                onDelete={handleDelete}
            />

            <EmojiPicker anchor={emojiAnchor} onClose={() => setEmojiAnchor(null)} onPick={insertEmoji} />
            <Box sx={(t) => ({ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.55, backgroundImage: `radial-gradient(${t.c.borderStrong} 1px, transparent 1px)`, backgroundSize: '22px 22px' })} />

            <ProfilePanel
                open={profileOpen}
                onClose={() => setProfileOpen(false)}
                chat={chat}
                photos={photos}
                userStatus={userStatus}
                onOpenPhoto={(key) => { const i = photos.findIndex(p => p.key === key); if (i >= 0) setViewerIndex(i); }}
                onAnalyse={onAnalyse}
                linkedIdentities={linkedIdentities}
                onOpenLinked={onOpenLinked}
            />

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
                onOpenProfile={() => setProfileOpen(true)}
                typing={typing}
                onSearch={() => setChatSearch((s) => ({ ...s, open: true }))}
            />

            {chatSearch.open && (
                <ChatSearchBar
                    query={chatSearch.query}
                    onQuery={setSearchQuery}
                    count={searchMatches.length}
                    index={Math.min(chatSearch.index, Math.max(0, searchMatches.length - 1))}
                    onStep={stepSearch}
                    onClose={() => setChatSearch({ open: false, query: '', index: 0 })}
                />
            )}

            {catchUpOpen && messages.length > 0 && (
                <CatchUpBanner
                    key={chat.externalChatId}
                    messages={unreadSlice}
                    unread={unreadAtOpen.current}
                    chatName={chat.name}
                    onClose={() => setCatchUpOpen(false)}
                />
            )}

            {awayFromEnd && <JumpToLatest unseen={unseen} onClick={() => { scrollToBottom(); setUnseen(0); }} />}

            <Box
                ref={messagesContainerRef}
                onScroll={e => {
                    const c = e.currentTarget;
                    // Scrolling up is the user taking over; anything within a screen-inch of
                    // the end still counts as following the conversation.
                    stickToBottom.current = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
                    const away = c.scrollHeight - c.scrollTop - c.clientHeight > 400;
                    if (away !== awayFromEnd) setAwayFromEnd(away);
                    if (!away && unseen) setUnseen(0);
                    if (c.scrollTop < 80) loadMoreMessages();
                }}
                sx={{ flexGrow: 1, overflow: 'auto', px: 3, py: 2, zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'var(--c-border-strong)', borderRadius: '4px' } }}
            >
                {loading ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <CircularProgress size={20} sx={{ mb: 1.5 }} />
                            <Typography sx={(t) => ({ color: t.c.textFaint, fontSize: 13 })}>{t('Завантаження повідомлень…')}</Typography>
                        </Box>
                    </Box>
                ) : messages.length === 0 ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 40, mb: 2, opacity: 0.3 }}>✉️</Typography>
                            <Typography sx={(t) => ({ color: t.c.textMuted, fontSize: 14, fontWeight: 650 })}>{t('Повідомлень ще немає')}</Typography>
                            <Typography sx={(t) => ({ color: t.c.textFaint, fontSize: 12, mt: 0.5 })}>{t('Напишіть перше повідомлення')}</Typography>
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
                                <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint })}>{t('Початок розмови')}</Typography>
                            </Box>
                        )}
                        {messages.map((msg, i) => {
                            const showDate = i === 0 || new Date(messages[i - 1].timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
                            /**
                             * Consecutive messages from one sender form a run: one avatar on its
                             * last line, tight spacing inside it.
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
                                    {showDate && <DayDivider timestamp={msg.timestamp} />}
                                    {firstUnreadKey && (msg.externalMessageId || msg.id) === firstUnreadKey && <UnreadDivider />}
                                    <MessageBubble message={msg} chat={chat} onReply={handleReply}
                                                  onDelete={handleDelete} onOpenMedia={openPhoto}
                                                  runEnds={runEnds} runStarts={runStarts}
                                                  transcript={transcripts[msg.externalMessageId]}
                                                  onMenu={(e, m) => setMenu({ x: e.clientX, y: e.clientY, message: m })}
                                                  onReact={chat.messengerType === 'TELEGRAM' ? handleReact : null}
                                                  highlightQuery={searchQuery || undefined}
                                                  flash={flashKey === (msg.externalMessageId || msg.id)} />
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>

            {/* Composer: the strips above the field, then the field */}
            <Box sx={(t) => ({ bgcolor: t.c.surfaceAlt, borderTop: `1px solid ${t.c.border}`, zIndex: 10, flexShrink: 0 })}>
                {draft && <DraftBanner draft={draft} onDismiss={dismissDraft} />}

                {offerReplies && (
                    <ReplySuggestions
                        key={lastMessage.externalMessageId || lastMessage.id}
                        messages={messages}
                        chatName={chat.name}
                        onPick={(text) => { setNewMessage(text); inputRef.current?.focus(); }}
                    />
                )}

                {editing && <QuoteBanner editing title={t('Редагування')} text={editing.text} onClose={cancelEdit} />}

                {replyingTo && (
                    <QuoteBanner
                        title={replyingTo.isFromUser ? t('Ви') : presentedName(replyingTo.senderName || chat.name)}
                        text={replyingTo.text}
                        onClose={handleCancelReply}
                    />
                )}
                {pending && (
                    <PendingAttachment
                        pending={pending}
                        withCaption={Boolean(newMessage.trim())}
                        sending={sending}
                        onRemove={() => setPending(null)}
                    />
                )}
                {recorder.error && (
                    <Box sx={{ px: 2.5, pt: 1 }}>
                        <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.danger })}>
                            ⚠ {recorder.error}
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
                        title={SUPPORTS_MEDIA[chat.messengerType] ? t('Прикріпити файл') : t('Viber не приймає вкладення')}
                        sx={(t) => ({ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', '&:disabled': { color: t.c.border } })}>
                        <AttachFileIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                    <IconButton
                        onClick={(e) => setEmojiAnchor(e.currentTarget)}
                        disabled={recorder.isRecording}
                        title={t('Емодзі')}
                        sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%' }}>
                        <SentimentSatisfiedAltOutlinedIcon sx={{ fontSize: 20 }} />
                    </IconButton>

                    {recorder.isRecording ? (
                        /* While recording the text box is meaningless, so it gives way to
                           the elapsed time and an explicit way out that discards the take. */
                        <Box sx={(t) => ({ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: t.c.accentSoft, border: `1px solid ${t.c.accent}`, borderRadius: `${radius.lg}`, px: 2, py: 1.3 })}>
                            <Box sx={(t) => ({ width: 8, height: 8, borderRadius: '50%', bgcolor: t.c.accentText, animation: 'pulse 1.2s ease-in-out infinite', '@keyframes pulse': { '50%': { opacity: 0.25 } } })} />
                            <Typography sx={(t) => ({ ...numeric, fontSize: 13, fontWeight: 700, color: t.c.accentText })}>
                                {formatDuration(recorder.seconds)}
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                            <Typography
                                onClick={() => recorder.cancel()}
                                sx={(t) => ({ fontSize: 12, fontWeight: 600, color: t.c.textMuted, cursor: 'pointer', '&:hover': { color: t.c.accentText } })}>
                                {t('Скасувати')}
                            </Typography>
                        </Box>
                    ) : (
                    <Box sx={(t) => ({ flex: 1, bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: '22px', px: 2, py: 1, boxShadow: t.c.shadow, transition: 'border-color .15s, box-shadow .15s', '&:focus-within': { borderColor: t.c.accent, boxShadow: `0 0 0 3px ${t.c.accentSoft}` } })}>
                        <textarea
                            ref={inputRef}
                            placeholder={pending ? t('Підпис до вкладення (необов’язково)…') : t('Введіть повідомлення...')}
                            value={newMessage}
                            onChange={e => { setNewMessage(e.target.value); signalTyping(); }}
                            onPaste={e => {
                                const file = e.clipboardData?.files?.[0];
                                if (file) { e.preventDefault(); stageFile(file); }
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComposerSend(); }
                                else if (e.key === 'Escape' && editing) cancelEdit();
                            }}
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
                        <IconButton onClick={handleComposerSend} disabled={sending} sx={(t) => ({ width: 44, height: 44, flexShrink: 0, bgcolor: t.c.accent, backgroundImage: `linear-gradient(160deg, ${t.c.accent}, ${t.c.accentHover})`, color: t.c.onAccent, borderRadius: '50%', boxShadow: `0 4px 12px ${t.c.accentSoft}`, transition: 'transform .12s', animation: 'sendIn .15s ease-out', '@keyframes sendIn': { from: { transform: 'scale(0.8)' }, to: { transform: 'none' } }, '&:hover': { bgcolor: t.c.accentHover, color: t.c.onAccent, transform: 'scale(1.05)' }, '&:disabled': { bgcolor: t.c.surfaceSunken, backgroundImage: 'none', color: t.c.textFaint } })}>
                            <SendIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    ) : (
                        <IconButton
                            onClick={handleMicClick}
                            disabled={sending || !SUPPORTS_MEDIA[chat.messengerType]}
                            title={recorder.isRecording ? t('Надіслати голосове') : t('Записати голосове')}
                            sx={(t) => ({ width: 44, height: 44, flexShrink: 0, bgcolor: recorder.isRecording ? t.c.accent : t.c.surfaceSunken, color: recorder.isRecording ? t.c.onAccent : t.c.textMuted, borderRadius: '50%', transition: 'background-color .12s', '&:hover': { bgcolor: recorder.isRecording ? t.c.accentHover : t.c.surfaceActive }, '&:disabled': { bgcolor: t.c.surfaceSunken, color: t.c.textFaint } })}>
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