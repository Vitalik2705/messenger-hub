import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import telegramService from '../services/telegramService';
import slackService from '../services/slackService';
import discordService from '../services/discordService';
import whatsappService from '../services/whatsappService';
import viberService from '../services/viberService';
import ChatWindow from './ChatWindow';
import ChatListItem from './sidebar/ChatListItem';
import MessageSearchResults from './sidebar/MessageSearchResults';
import WelcomeScreen from './sidebar/WelcomeScreen';
import SidebarHeader from './sidebar/SidebarHeader';
import AccountsDialog from './dialogs/AccountsDialog';
import NetworkFilter from './sidebar/NetworkFilter';
import SearchField from './sidebar/SearchField';
import SectionLabel from './sidebar/SectionLabel';
import EmptyList from './sidebar/EmptyList';
import searchService from '../services/searchService';
import TelegramDialog from './dialogs/TelegramDialog';
import SlackDialog from './dialogs/SlackDialog';
import DiscordDialog from './dialogs/DiscordDialog';
import WhatsAppDialog from './dialogs/WhatsAppDialog';
import ViberDialog from './dialogs/ViberDialog';
import AddAccountDialog from './dialogs/AddAccountDialog';
import ContactsDialog from './dialogs/ContactsDialog';
import ComposeDialog from './dialogs/ComposeDialog';
import AnalysisDialog from './dialogs/AnalysisDialog';
import contactService from '../services/contactService';
import notificationService from '../services/notificationService';
import { Box, List } from '@mui/material';
import { MESSENGER_LABELS } from '../theme/tokens';
import { accountScope, matchesScope, networkOf } from '../utils/scope';

const DashboardPage = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();

    // Multi-account: arrays of MessengerAccountDTO
    const [telegramAccounts, setTelegramAccounts] = useState([]);
    const [slackAccounts, setSlackAccounts] = useState([]);
    const [discordAccounts, setDiscordAccounts] = useState([]);
    const [whatsappAccounts, setWhatsappAccounts] = useState([]);
    const [viberAccounts, setViberAccounts] = useState([]);

    const [telegramChats, setTelegramChats] = useState([]);
    const [slackChats, setSlackChats] = useState([]);
    const [discordChats, setDiscordChats] = useState([]);
    const [whatsappChats, setWhatsappChats] = useState([]);
    const [viberChats, setViberChats] = useState([]);

    const [selectedChat, setSelectedChat] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('ALL');
    /** Hides bots, channels and service accounts — an axis independent of the network scope. */
    const [peopleOnly, setPeopleOnly] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // History search — separate from the chat-name filter above it, which is purely local
    const [messageHits, setMessageHits] = useState([]);
    const [messageHitsTotal, setMessageHitsTotal] = useState(0);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState('');
    /**
     * Which kind of history search is running.
     *
     * Not a filter on one search but a choice between two: full-text finds the words you
     * typed, semantic finds what you meant. They rank by different things and neither is a
     * superset of the other, so the user picks.
     */
    const [searchMode, setSearchMode] = useState('text');

    const [openContactsDialog, setOpenContactsDialog] = useState(false);

    // Telegram dialog
    const [openTelegramDialog, setOpenTelegramDialog] = useState(false);
    const [tgStep, setTgStep] = useState(0);
    const [tgPhone, setTgPhone] = useState('');
    const [tgCode, setTgCode] = useState('');
    const [tgPassword, setTgPassword] = useState('');
    const [tgPhoneCodeHash, setTgPhoneCodeHash] = useState('');
    const [tgSession, setTgSession] = useState('');
    const [tgError, setTgError] = useState('');
    const [tgLoading, setTgLoading] = useState(false);

    // Slack dialog
    const [openSlackDialog, setOpenSlackDialog] = useState(false);
    const [slackToken, setSlackToken] = useState('');
    const [slackError, setSlackError] = useState('');
    const [slackLoading, setSlackLoading] = useState(false);

    // Discord dialog
    const [openDiscordDialog, setOpenDiscordDialog] = useState(false);
    const [discordToken, setDiscordToken] = useState('');
    const [discordError, setDiscordError] = useState('');
    const [discordLoading, setDiscordLoading] = useState(false);

    // WhatsApp dialog
    const [openWhatsAppDialog, setOpenWhatsAppDialog] = useState(false);

    // Viber dialog
    const [openViberDialog, setOpenViberDialog] = useState(false);
    const [viberToken, setViberToken] = useState('');
    const [viberError, setViberError] = useState('');
    const [viberLoading, setViberLoading] = useState(false);

    // Add account picker
    const [openAddAccountDialog, setOpenAddAccountDialog] = useState(false);
    const [openAccountsDialog, setOpenAccountsDialog] = useState(false);
    const [openComposeDialog, setOpenComposeDialog] = useState(false);
    const [openAnalysisDialog, setOpenAnalysisDialog] = useState(false);

    /**
     * Confirmed people, held here rather than only inside the contacts dialog.
     *
     * A link the user has confirmed is worth nothing while its only evidence is a list in a
     * dialog they have to remember to open. Kept at this level, it can put the person's
     * other networks on the chat they are actually reading.
     */
    const [contacts, setContacts] = useState([]);

    const chatPollingRef = useRef(null);
    /** Guards against a second poll starting while the previous one is still in flight. */
    const pollInFlightRef = useRef(false);

    const telegramConnected = telegramAccounts.length > 0;
    const slackConnected = slackAccounts.length > 0;
    const discordConnected = discordAccounts.length > 0;
    const whatsappConnected = whatsappAccounts.length > 0;
    const viberConnected = viberAccounts.length > 0;

    useEffect(() => { checkStatus(); }, []);
    useEffect(() => { notificationService.requestPermission(); }, []);
    useEffect(() => { loadContacts(); }, []);

    /** Quiet on failure: a missing link degrades the header, it does not break the app. */
    const loadContacts = async () => {
        try {
            const response = await contactService.getContacts();
            setContacts(response.data);
        } catch { /* the chat still opens without its cross-network links */ }
    };
    useEffect(() => {
        if (telegramConnected || slackConnected || discordConnected || whatsappConnected || viberConnected) startChatPolling();
        else stopChatPolling();
        return () => stopChatPolling();
    }, [telegramConnected, slackConnected, discordConnected, whatsappConnected, viberConnected]);

    /**
     * Ctrl/Cmd+K opens "write to".
     *
     * The chat-list field already owns `/`, and this is a different question — that one
     * searches what was said, this one finds who to say it to.
     */
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpenComposeDialog(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Polling pauses on a hidden tab, so coming back needs one immediate pass rather than
    // up to a full interval of showing a stale list.
    useEffect(() => {
        const onVisible = () => { if (!document.hidden) pollChats(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    });

    /**
     * Refreshes the chat list in the background.
     *
     * Every pass costs one dialog-list fetch per connected account, straight through to the
     * messenger. At five seconds and four Telegram accounts that was around fifty round
     * trips a minute, sharing one Telethon connection with the fetches the user is actually
     * waiting on — which is most of why opening a chat felt slow.
     */
    const CHAT_POLL_INTERVAL = 25000;

    const startChatPolling = () => { stopChatPolling(); chatPollingRef.current = setInterval(pollChats, CHAT_POLL_INTERVAL); };
    const stopChatPolling = () => { if (chatPollingRef.current) { clearInterval(chatPollingRef.current); chatPollingRef.current = null; } };

    const pollChats = async () => {
        // A slow messenger used to let passes pile up on top of each other: the interval
        // fired regardless of whether the previous one had come back.
        if (pollInFlightRef.current) return;
        // A tab nobody is looking at has no list to keep fresh, and its requests queue
        // ahead of the ones from the window in front of the user.
        if (typeof document !== 'undefined' && document.hidden) return;
        pollInFlightRef.current = true;
        try {
            if (telegramConnected) {
                const chats = await telegramService.getChats();
                setTelegramChats(prev => {
                    const avatarMap = new Map(prev.map(c => [c.externalChatId, c.avatarBase64]));
                    const pinMap = new Map(prev.map(c => [c.externalChatId, c.isPinned]));
                    const unreadMap = new Map(prev.map(c => [c.externalChatId, c.unreadCount || 0]));
                    chats.forEach(chat => {
                        const prevUnread = unreadMap.get(chat.externalChatId) || 0;
                        const newUnread = chat.unreadCount || 0;
                        if (newUnread > prevUnread) notificationService.showMessage(chat.name, chat.lastMessage, 'TELEGRAM');
                    });
                    return chats.map(c => ({
                        ...c,
                        avatarBase64: avatarMap.get(c.externalChatId) || c.avatarBase64,
                        isPinned: pinMap.get(c.externalChatId) ?? c.isPinned,
                    }));
                });
            }
            if (slackConnected) {
                const chats = await slackService.getChats();
                setSlackChats(prev => {
                    const unreadMap = new Map(prev.map(c => [c.externalChatId, c.unreadCount || 0]));
                    chats.forEach(chat => {
                        const prevUnread = unreadMap.get(chat.externalChatId) || 0;
                        const newUnread = chat.unreadCount || 0;
                        if (newUnread > prevUnread) notificationService.showMessage(chat.name, chat.lastMessage, 'SLACK');
                    });
                    return chats;
                });
            }
            if (discordConnected) {
                const chats = await discordService.getChats();
                setDiscordChats(chats);
            }
            if (whatsappConnected) {
                const chats = await whatsappService.getChats();
                setWhatsappChats(chats);
            }
            if (viberConnected) {
                const chats = await viberService.getChats();
                setViberChats(chats);
            }
        } catch {} finally { pollInFlightRef.current = false; }
    };

    const checkStatus = async () => {
        try {
            const tgAccounts = await telegramService.getAccounts();
            setTelegramAccounts(tgAccounts);
            if (tgAccounts.length > 0) loadTelegramChats();
        } catch {}
        try {
            const slAccounts = await slackService.getAccounts();
            setSlackAccounts(slAccounts);
            if (slAccounts.length > 0) loadSlackChats();
        } catch {}
        try {
            const dcAccounts = await discordService.getAccounts();
            setDiscordAccounts(dcAccounts);
            if (dcAccounts.length > 0) loadDiscordChats();
        } catch {}
        try {
            const waAccounts = await whatsappService.getAccounts();
            setWhatsappAccounts(waAccounts);
            if (waAccounts.length > 0) loadWhatsAppChats();
        } catch {}
        try {
            const vbAccounts = await viberService.getAccounts();
            setViberAccounts(vbAccounts);
            if (vbAccounts.length > 0) loadViberChats();
        } catch {}
    };

    const loadTelegramChats = async () => {
        try {
            const chats = await telegramService.getChats();
            setTelegramChats(chats);
            chats.forEach(chat => {
                if (chat.avatarBase64) return;
                telegramService.getAvatar(chat.externalChatId)
                    .then(r => { if (r?.avatar_base64) setTelegramChats(prev => prev.map(c => c.externalChatId === chat.externalChatId ? { ...c, avatarBase64: r.avatar_base64 } : c)); })
                    .catch(() => {});
            });
        } catch {}
    };

    const loadSlackChats = async () => { try { setSlackChats(await slackService.getChats()); } catch {} };
    const loadDiscordChats = async () => { try { setDiscordChats(await discordService.getChats()); } catch {} };
    const loadWhatsAppChats = async () => { try { setWhatsappChats(await whatsappService.getChats()); } catch {} };
    const loadViberChats = async () => { try { setViberChats(await viberService.getChats()); } catch {} };

    const handleSendCode = async () => {
        setTgError(''); setTgLoading(true);
        try { const r = await telegramService.sendCode(tgPhone); setTgPhoneCodeHash(r.phone_code_hash); setTgSession(r.session); setTgStep(1); }
        catch (e) { setTgError(e.response?.data?.detail || 'Failed to send code'); }
        finally { setTgLoading(false); }
    };
    const handleSignIn = async () => {
        setTgError(''); setTgLoading(true);
        try {
            const r = await telegramService.signIn({ phone: tgPhone, code: tgCode, phone_code_hash: tgPhoneCodeHash, session: tgSession });
            if (r.requires_password) { setTgSession(r.session); setTgStep(2); }
            else { const accounts = await telegramService.getAccounts(); setTelegramAccounts(accounts); setOpenTelegramDialog(false); loadTelegramChats(); }
        }
        catch (e) { setTgError(e.response?.data?.detail || 'Invalid code'); }
        finally { setTgLoading(false); }
    };
    const handleSignInPassword = async () => {
        setTgError(''); setTgLoading(true);
        try {
            await telegramService.signInPassword({ phone: tgPhone, password: tgPassword, session: tgSession });
            const accounts = await telegramService.getAccounts();
            setTelegramAccounts(accounts); setOpenTelegramDialog(false); loadTelegramChats();
        }
        catch (e) { setTgError(e.response?.data?.detail || 'Invalid password'); }
        finally { setTgLoading(false); }
    };
    const handleDisconnectTelegram = async (accountId) => {
        try {
            await telegramService.disconnect(accountId);
            const accounts = await telegramService.getAccounts();
            setTelegramAccounts(accounts);
            if (accounts.length === 0) { setTelegramChats([]); setSelectedChat(p => p?.messengerType === 'TELEGRAM' ? null : p); }
            else loadTelegramChats();
        } catch {}
    };
    const handleConnectSlack = async () => {
        setSlackError(''); setSlackLoading(true);
        try {
            await slackService.connect(slackToken);
            const accounts = await slackService.getAccounts();
            setSlackAccounts(accounts); setOpenSlackDialog(false); loadSlackChats();
        }
        catch (e) { setSlackError(e.response?.data?.detail || 'Failed to connect'); }
        finally { setSlackLoading(false); }
    };
    const handleDisconnectSlack = async (accountId) => {
        try {
            await slackService.disconnect(accountId);
            const accounts = await slackService.getAccounts();
            setSlackAccounts(accounts);
            if (accounts.length === 0) { setSlackChats([]); setSelectedChat(p => p?.messengerType === 'SLACK' ? null : p); }
            else loadSlackChats();
        } catch {}
    };
    const handleConnectDiscord = async () => {
        setDiscordError(''); setDiscordLoading(true);
        try {
            await discordService.connect(discordToken);
            const accounts = await discordService.getAccounts();
            setDiscordAccounts(accounts); setOpenDiscordDialog(false); loadDiscordChats();
        }
        catch (e) { setDiscordError(e.response?.data?.detail || e.response?.data?.error || 'Failed to connect'); }
        finally { setDiscordLoading(false); }
    };
    const handleDisconnectDiscord = async (accountId) => {
        try {
            await discordService.disconnect(accountId);
            const accounts = await discordService.getAccounts();
            setDiscordAccounts(accounts);
            if (accounts.length === 0) { setDiscordChats([]); setSelectedChat(p => p?.messengerType === 'DISCORD' ? null : p); }
            else loadDiscordChats();
        } catch {}
    };
    const handleWhatsAppConnected = async () => {
        setOpenWhatsAppDialog(false);
        try {
            const accounts = await whatsappService.getAccounts();
            setWhatsappAccounts(accounts);
            if (accounts.length > 0) loadWhatsAppChats();
        } catch {}
    };
    const handleDisconnectWhatsApp = async (accountId) => {
        try {
            await whatsappService.disconnect(accountId);
            const accounts = await whatsappService.getAccounts();
            setWhatsappAccounts(accounts);
            if (accounts.length === 0) { setWhatsappChats([]); setSelectedChat(p => p?.messengerType === 'WHATSAPP' ? null : p); }
            else loadWhatsAppChats();
        } catch {}
    };
    const handleConnectViber = async () => {
        setViberError(''); setViberLoading(true);
        try {
            await viberService.connect(viberToken);
            const accounts = await viberService.getAccounts();
            setViberAccounts(accounts); setOpenViberDialog(false); loadViberChats();
        }
        catch (e) { setViberError(e.response?.data?.detail || 'Failed to connect'); }
        finally { setViberLoading(false); }
    };
    const handleDisconnectViber = async (accountId) => {
        try {
            await viberService.disconnect(accountId);
            const accounts = await viberService.getAccounts();
            setViberAccounts(accounts);
            if (accounts.length === 0) { setViberChats([]); setSelectedChat(p => p?.messengerType === 'VIBER' ? null : p); }
            else loadViberChats();
        } catch {}
    };

    const handleMessengerSelect = (key) => {
        if (key === 'TELEGRAM') { setTgStep(0); setTgPhone(''); setTgCode(''); setTgPassword(''); setTgError(''); setOpenTelegramDialog(true); }
        else if (key === 'SLACK') { setSlackError(''); setSlackToken(''); setOpenSlackDialog(true); }
        else if (key === 'DISCORD') { setDiscordError(''); setDiscordToken(''); setOpenDiscordDialog(true); }
        else if (key === 'WHATSAPP') { setOpenWhatsAppDialog(true); }
        else if (key === 'VIBER') { setViberError(''); setViberToken(''); setOpenViberDialog(true); }
    };

    const handleSelectChat = (chat) => {
        setSelectedChat(chat);
        if (chat.messengerType === 'TELEGRAM' && chat.unreadCount > 0) {
            telegramService.markAsRead(chat.externalChatId).catch(() => {});
            setTelegramChats(p => p.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
        }
    };

    /**
     * Search the archive as the user types.
     *
     * Debounced, because every keystroke would otherwise be a round-trip; aborted on the
     * next keystroke, so a slow response for "зус" cannot land after the one for "зустріч"
     * and overwrite it.
     */
    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 2) {
            setMessageHits([]);
            setMessageHitsTotal(0);
            setSearchError('');
            setSearchLoading(false);
            return;
        }

        const controller = new AbortController();
        setSearchLoading(true);

        const timer = setTimeout(async () => {
            try {
                if (searchMode === 'semantic') {
                    const res = await searchService.searchSemantic(query, {
                        limit: 15, signal: controller.signal,
                    });
                    setMessageHits(res.data.results || []);
                    setMessageHitsTotal((res.data.results || []).length);
                    // The server reports a missing model as a result, not a failure — the
                    // word search beside it still works.
                    setSearchError(res.data.error || '');
                    return;
                }
                const res = await searchService.searchMessages(query, {
                    // History search narrows by network, which is as fine-grained as the
                    // endpoint goes; an account scope still restricts to its own network.
                    messenger: networkOf(filter),
                    limit: 15,
                    signal: controller.signal,
                });
                setMessageHits(res.data.results);
                setMessageHitsTotal(res.data.total);
                setSearchError('');
            } catch (err) {
                if (controller.signal.aborted) return;
                setMessageHits([]);
                setMessageHitsTotal(0);
                setSearchError('Не вдалося виконати пошук');
            } finally {
                if (!controller.signal.aborted) setSearchLoading(false);
            }
        }, 300);

        return () => { clearTimeout(timer); controller.abort(); };
    }, [searchQuery, filter, searchMode]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            if (telegramConnected) { await telegramService.sync(); loadTelegramChats(); }
            if (slackConnected) { await slackService.sync(); loadSlackChats(); }
        } catch {} finally { setSyncing(false); }
    };

    const handleTogglePin = async (chat) => {
        if (chat.messengerType !== 'TELEGRAM') return;
        try {
            const res = await telegramService.togglePin(chat.externalChatId);
            const isPinned = res.data.isPinned;
            setTelegramChats(prev => prev.map(c => c.id === chat.id ? { ...c, isPinned } : c));
        } catch (err) { console.error(err); }
    };

    const everyChat = [...telegramChats, ...slackChats, ...discordChats, ...whatsappChats, ...viberChats];

    /**
     * Keeps only chats with a human on the other side.
     *
     * `chatKind` is what the messenger itself reports — Telegram's bot/broadcast flags,
     * Slack's is_bot — not a guess. A chat synced before the field existed has no kind and
     * is kept: hiding a real person would be the worse error, and the next sync fills it in.
     */
    const isPerson = (chat) => chat.chatKind == null || chat.chatKind === 'PERSON';

    const inScope = everyChat
        .filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter(c => matchesScope(c, filter));

    // What the people-only filter is costing right now, shown next to the toggle.
    const hiddenByPeopleOnly = inScope.length - inScope.filter(isPerson).length;

    const allChats = inScope
        .filter(c => !peopleOnly || isPerson(c))
        .sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
        });

    /**
     * A hit's chat is looked up in the unfiltered list: the sidebar above may have filtered
     * it out by name, but the message itself matched and must still be reachable.
     */
    /** Opens a chat by its database id, whichever list the id arrived from. */
    const openChatById = (chatId) => {
        const chat = everyChat.find(c => c.id === chatId);
        if (chat) handleSelectChat(chat);
    };

    const handleOpenSearchHit = (hit) => openChatById(hit.chatId);

    /**
     * The person behind the open chat, and their other chats.
     *
     * Identities whose chat is not in the list are dropped rather than shown as dead ends —
     * that happens whenever the account they belong to is disconnected.
     */
    const openChatContact = selectedChat
        ? contacts.find(c => c.identities.some(i => i.chatId === selectedChat.id))
        : null;

    /**
     * Who the user can write to, as people rather than as chats.
     *
     * Chats linked to one contact collapse into a single entry holding every route to that
     * person; everything else stands for itself. Channels and service accounts are dropped —
     * they are not addressable, and offering them would put the news feeds the user actually
     * has most of at the top of a list meant for writing.
     */
    const composeTargets = (() => {
        const contactOfChat = new Map();
        contacts.forEach(contact => contact.identities.forEach(identity => {
            if (identity.chatId != null) contactOfChat.set(identity.chatId, contact);
        }));

        const byKey = new Map();
        everyChat
            .filter(chat => chat.chatKind !== 'CHANNEL' && chat.chatKind !== 'SERVICE')
            .forEach(chat => {
                const contact = contactOfChat.get(chat.id);
                const key = contact ? `contact:${contact.id}` : `chat:${chat.id}`;
                const entry = byKey.get(key)
                    || { key, name: contact?.displayName || chat.name || '—', chats: [] };
                entry.chats.push(chat);
                byKey.set(key, entry);
            });

        const recency = (chat) => (chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : 0);
        return [...byKey.values()]
            .map(entry => ({ ...entry, chats: [...entry.chats].sort((a, b) => recency(b) - recency(a)) }))
            .sort((a, b) => recency(b.chats[0]) - recency(a.chats[0]));
    })();

    const linkedIdentities = (openChatContact?.identities || []).filter(identity =>
        identity.chatId != null
        && identity.chatId !== selectedChat?.id
        && everyChat.some(c => c.id === identity.chatId));

    /** Matches the minimum the search effect will actually send to the server. */
    const isSearchingHistory = searchQuery.trim().length >= 2;

    /**
     * Whether a row has to name its network.
     *
     * With one messenger connected the mark would repeat on every row and carry no
     * information; from the second one on, it is the only thing that answers which network a
     * chat came from — the colour rail distinguishes them but does not name them.
     */
    const hasMultipleNetworks = [
        telegramAccounts, slackAccounts, discordAccounts, whatsappAccounts, viberAccounts,
    ].filter(accounts => accounts.length > 0).length > 1;

    const chatListItems = allChats.map(chat => (
        <ChatListItem
            key={`${chat.messengerType}-${chat.id}`}
            chat={chat}
            isSelected={selectedChat?.id === chat.id}
            onClick={() => handleSelectChat(chat)}
            onTogglePin={handleTogglePin}
            showNetwork={hasMultipleNetworks}
        />
    ));

    const totalUnread = allChats.reduce((s, c) => s + (c.unreadCount || 0), 0);

    /**
     * The five networks, described once instead of being spelled out in every list, filter
     * row and account chip. Adding a sixth messenger is now one entry rather than a hunt
     * through the file.
     */
    const NETWORKS = [
        { type: 'TELEGRAM', accounts: telegramAccounts, chats: telegramChats, onDisconnect: handleDisconnectTelegram },
        { type: 'SLACK', accounts: slackAccounts, chats: slackChats, onDisconnect: handleDisconnectSlack },
        { type: 'DISCORD', accounts: discordAccounts, chats: discordChats, onDisconnect: handleDisconnectDiscord },
        { type: 'WHATSAPP', accounts: whatsappAccounts, chats: whatsappChats, onDisconnect: handleDisconnectWhatsApp },
        { type: 'VIBER', accounts: viberAccounts, chats: viberChats, onDisconnect: handleDisconnectViber },
    ];

    /** What each account actually contributes — the accounts dialog reports it, the filter reads the unread half. */
    const tallyByAccount = everyChat.reduce((totals, chat) => {
        if (chat.messengerAccountId == null) return totals;
        const tally = totals[chat.messengerAccountId] || { chats: 0, unread: 0 };
        tally.chats += 1;
        tally.unread += chat.unreadCount || 0;
        totals[chat.messengerAccountId] = tally;
        return totals;
    }, {});

    const connectedAccounts = NETWORKS.flatMap(network =>
        network.accounts.map(account => ({
            id: account.id,
            messengerType: network.type,
            label: account.accountLabel || account.username || network.type,
            chats: tallyByAccount[account.id]?.chats || 0,
            unread: tallyByAccount[account.id]?.unread || 0,
            onDisconnect: network.onDisconnect,
        }))
    );

    const connectedByType = Object.fromEntries(
        NETWORKS.map(network => [network.type, network.accounts.length > 0]));

    const unreadByType = Object.fromEntries(
        NETWORKS.map(network => [
            network.type,
            network.chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0),
        ]));

    /** Only networks with a second account need their chips split; the filter decides. */
    const accountsByType = Object.fromEntries(
        NETWORKS.map(network => [
            network.type,
            network.accounts.map(account => ({
                id: account.id,
                label: account.accountLabel || account.username || MESSENGER_LABELS[network.type],
            })),
        ]));

    /**
     * Account names, but only where naming the account tells you something.
     *
     * A person reachable from two Telegram accounts appears twice under one contact, with
     * the same name both times; the account is the only thing that separates the rows. On a
     * network with a single account it would just repeat on every row.
     */
    const accountLabelById = Object.fromEntries(
        NETWORKS.filter(network => network.accounts.length > 1)
            .flatMap(network => network.accounts.map(account => [
                account.id,
                account.accountLabel || account.username || MESSENGER_LABELS[network.type],
            ])));

    const unreadByAccount = Object.fromEntries(
        Object.entries(tallyByAccount).map(([id, tally]) => [id, tally.unread]));

    /**
     * Falls back to 'Усі' when the scope stops existing.
     *
     * Disconnecting the account or network being filtered on otherwise leaves an empty list
     * with no chip highlighted, which reads as "you have no chats" rather than "that filter
     * no longer applies". Also covers a network dropping back to one account, where the
     * per-account chips collapse into a single network chip.
     */
    const scopeKeys = new Set([
        'ALL',
        ...NETWORKS.filter(n => n.accounts.length > 0).flatMap(n => [
            // The network is always selectable; its accounts are offered as well once
            // there is more than one to tell apart.
            n.type,
            ...(n.accounts.length > 1 ? n.accounts.map(a => accountScope(n.type, a.id)) : []),
        ]),
    ]);
    useEffect(() => {
        if (!scopeKeys.has(filter)) setFilter('ALL');
    }, [filter, [...scopeKeys].join('|')]);

    return (
        <Box sx={(t) => ({ display: 'flex', height: '100vh', bgcolor: t.c.bg, overflow: 'hidden' })}>

            {/* Бічна панель */}
            <Box
                component="aside"
                sx={(t) => ({
                    width: 330, flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    bgcolor: t.c.surfaceAlt,
                    borderRight: `1px solid ${t.c.border}`,
                })}
            >
                <SidebarHeader
                    chatCount={allChats.length}
                    totalUnread={totalUnread}
                    syncing={syncing}
                    accounts={connectedAccounts}
                    onSync={handleSync}
                    onContacts={() => setOpenContactsDialog(true)}
                    onAccounts={() => setOpenAccountsDialog(true)}
                    onCompose={() => setOpenComposeDialog(true)}
                    onAnalytics={() => navigate('/analytics')}
                    onLogout={logout}
                />

                <Box sx={{ px: 2, pb: 1.25, flexShrink: 0 }}>
                    <SearchField value={searchQuery} onChange={setSearchQuery} />
                </Box>

                <NetworkFilter
                    value={filter}
                    onChange={setFilter}
                    connected={connectedByType}
                    unreadByType={unreadByType}
                    accountsByType={accountsByType}
                    unreadByAccount={unreadByAccount}
                    peopleOnly={peopleOnly}
                    onPeopleOnlyChange={setPeopleOnly}
                    hiddenCount={hiddenByPeopleOnly}
                    totalUnread={totalUnread}
                />

                {/* `flex: 1 1 0`, not `flexGrow: 1`. With a basis of `auto` the list asks for
                    the full height of every chat it holds, the column overflows, and flex
                    recovers the difference by shrinking its siblings — which is what was
                    slicing the bottom off the filter chips. */}
                <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', pb: 1 }}>
                    {isSearchingHistory ? (
                        <>
                            {/* While searching, the list above is the chat-name match and the
                                section below is the history match — labelled so they don't read
                                as one ranking. */}
                            {allChats.length > 0 && (
                                <>
                                    <SectionLabel>Чати</SectionLabel>
                                    <List sx={{ p: 0 }}>{chatListItems}</List>
                                </>
                            )}
                            <MessageSearchResults
                                results={messageHits}
                                total={messageHitsTotal}
                                loading={searchLoading}
                                error={searchError}
                                onSelect={handleOpenSearchHit}
                                mode={searchMode}
                                onModeChange={setSearchMode}
                            />
                        </>
                    ) : allChats.length === 0 ? (
                        <EmptyList
                            searching={Boolean(searchQuery)}
                            hasAccounts={connectedAccounts.length > 0}
                            syncing={syncing}
                            onAdd={() => setOpenAddAccountDialog(true)}
                        />
                    ) : (
                        <List sx={{ p: 0 }}>{chatListItems}</List>
                    )}
                </Box>
            </Box>


            {/* Основна область */}
            {selectedChat
                ? <ChatWindow
                    chat={selectedChat}
                    onClose={() => setSelectedChat(null)}
                    contactName={openChatContact?.displayName}
                    linkedIdentities={linkedIdentities}
                    accountLabels={accountLabelById}
                    onOpenLinked={openChatById}
                    onAnalyse={() => setOpenAnalysisDialog(true)}
                  />
                : <WelcomeScreen
                    networks={NETWORKS.map(n => ({
                        type: n.type,
                        connected: n.accounts.length > 0,
                        chats: n.chats.length,
                        unread: unreadByType[n.type] || 0,
                    }))}
                    totalUnread={totalUnread}
                    onPickNetwork={setFilter}
                    onAddAccount={() => setOpenAddAccountDialog(true)}
                    onOpenContacts={() => setOpenContactsDialog(true)}
                  />
            }

            <TelegramDialog open={openTelegramDialog} onClose={() => setOpenTelegramDialog(false)} step={tgStep} phone={tgPhone} code={tgCode} password={tgPassword} error={tgError} loading={tgLoading} onPhoneChange={setTgPhone} onCodeChange={setTgCode} onPasswordChange={setTgPassword} onSendCode={handleSendCode} onSignIn={handleSignIn} onSignInPassword={handleSignInPassword} />
            <SlackDialog open={openSlackDialog} onClose={() => setOpenSlackDialog(false)} token={slackToken} onTokenChange={setSlackToken} onConnect={handleConnectSlack} loading={slackLoading} error={slackError} />
            <DiscordDialog open={openDiscordDialog} onClose={() => setOpenDiscordDialog(false)} token={discordToken} onTokenChange={setDiscordToken} onConnect={handleConnectDiscord} loading={discordLoading} error={discordError} />
            <WhatsAppDialog open={openWhatsAppDialog} onClose={() => setOpenWhatsAppDialog(false)} onConnected={handleWhatsAppConnected} />
            <ViberDialog open={openViberDialog} onClose={() => setOpenViberDialog(false)} token={viberToken} onTokenChange={setViberToken} onConnect={handleConnectViber} loading={viberLoading} error={viberError} />
            <AnalysisDialog
                open={openAnalysisDialog}
                onClose={() => setOpenAnalysisDialog(false)}
                chat={selectedChat}
            />
            <ComposeDialog
                open={openComposeDialog}
                onClose={() => setOpenComposeDialog(false)}
                targets={composeTargets}
                accountLabels={accountLabelById}
                onPick={openChatById}
            />
            <AccountsDialog open={openAccountsDialog} onClose={() => setOpenAccountsDialog(false)} accounts={connectedAccounts} onAdd={() => setOpenAddAccountDialog(true)} />
            <AddAccountDialog open={openAddAccountDialog} onClose={() => setOpenAddAccountDialog(false)} onSelect={handleMessengerSelect} />
            <ContactsDialog
                open={openContactsDialog}
                onClose={() => { setOpenContactsDialog(false); loadContacts(); }}
                onOpenChat={openChatById}
                onChanged={loadContacts}
                accountLabels={accountLabelById}
            />
        </Box>
    );
};

export default DashboardPage;