import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import telegramService from '../services/telegramService';
import slackService from '../services/slackService';
import useMessengers, { NETWORK_TYPES } from '../hooks/useMessengers';
import useHistorySearch, { MIN_QUERY } from '../hooks/useHistorySearch';
import ChatWindow from '../components/chat/ChatWindow';
import ChatListItem from '../components/sidebar/ChatListItem';
import MessageSearchResults from '../components/sidebar/MessageSearchResults';
import WelcomeScreen from '../components/sidebar/WelcomeScreen';
import SidebarHeader from '../components/sidebar/SidebarHeader';
import AccountsDialog from '../components/dialogs/AccountsDialog';
import NetworkFilter from '../components/sidebar/NetworkFilter';
import SearchField from '../components/sidebar/SearchField';
import SectionLabel from '../components/sidebar/SectionLabel';
import EmptyList from '../components/sidebar/EmptyList';
import TelegramDialog from '../components/dialogs/TelegramDialog';
import TokenConnectDialog from '../components/dialogs/TokenConnectDialog';
import WhatsAppDialog from '../components/dialogs/WhatsAppDialog';
import AddAccountDialog from '../components/dialogs/AddAccountDialog';
import ContactsDialog from '../components/dialogs/ContactsDialog';
import SystemStatusDialog from '../components/dialogs/SystemStatusDialog';
import CommandPalette from '../components/dialogs/CommandPalette';
import { useMediaQuery } from '@mui/material';
import { useThemeMode } from '../context/ThemeModeContext';
import { useToast } from '../context/ToastContext';
import { usePresentation } from '../context/PresentationContext';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import ComposeDialog from '../components/dialogs/ComposeDialog';
import AnalysisDialog from '../components/dialogs/AnalysisDialog';
import contactService from '../services/contactService';
import notificationService from '../services/notificationService';
import { Box, List } from '@mui/material';
import { MESSENGER_LABELS } from '../theme/tokens';
import { accountScope, matchesScope, networkOf } from '../utils/scope';
import { t } from '../i18n';

const DashboardPage = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const { accounts, chats, everyChat, connectedTypes, setChatsOf, loadChats, refreshAccounts, disconnect } = useMessengers();


    const [selectedChat, setSelectedChat] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [chosenFilter, setFilter] = useState('ALL');
    /**
     * The scope in force: the chosen one while it exists, otherwise 'ALL' — e.g. after its account
     * is disconnected or a network drops back to one account.
     */
    const scopeKeys = new Set(['ALL', ...connectedTypes.flatMap(type => [
        // The network is always selectable; its accounts are offered as well once there is
        // more than one to tell apart.
        type,
        ...(accounts[type].length > 1 ? accounts[type].map(a => accountScope(type, a.id)) : []),
    ])]);
    const filter = scopeKeys.has(chosenFilter) ? chosenFilter : 'ALL';
    /** Hides bots, channels and service accounts — an axis independent of the network scope. */
    const [peopleOnly, setPeopleOnly] = useState(false);
    const [syncing, setSyncing] = useState(false);

    /**
     * History search mode: 'text' (words), 'semantic' (meaning) or 'hybrid' (both, merged on the
     * server).
     */
    const [searchMode, setSearchMode] = useState('hybrid');

    const [openContactsDialog, setOpenContactsDialog] = useState(false);
    const [openSystemStatus, setOpenSystemStatus] = useState(false);
    const [openPalette, setOpenPalette] = useState(false);
    /** Chat list tab by what is on the other side: all, people, groups, channels, bots. */
    const [kindTab, setKindTab] = useState('ALL');
    const narrow = useMediaQuery('(max-width: 760px)');
    const { mode, setMode } = useThemeMode();
    const { presenting, setPresenting } = usePresentation();
    const toast = useToast();

    /** The network whose connect dialog is open, if any. */
    const [connectDialog, setConnectDialog] = useState(null);

    // Add account picker
    const [openAddAccountDialog, setOpenAddAccountDialog] = useState(false);
    // Settings → "Керувати підключеннями" lands here with the accounts dialog already open.
    const [openAccountsDialog, setOpenAccountsDialog] = useState(Boolean(location.state?.openAccounts));
    const [openComposeDialog, setOpenComposeDialog] = useState(false);
    const [openAnalysisDialog, setOpenAnalysisDialog] = useState(false);

    /**
     * Contacts linked across networks, kept here so the open chat can show the person's other
     * chats.
     */
    const [contacts, setContacts] = useState([]);

    useEffect(() => { notificationService.requestPermission(); }, []);
    useEffect(() => { loadContacts(); }, []);

    /** Quiet on failure: a missing link degrades the header, it does not break the app. */
    const loadContacts = async () => {
        try {
            const response = await contactService.getContacts();
            setContacts(response.data);
        } catch { /* the chat still opens without its cross-network links */ }
    };
    /** Ctrl/Cmd+K opens the command palette; `/` stays with the chat-list search field. */
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpenPalette(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    /** The connect dialog finished: show the new account and its chats. */
    const handleConnected = (type) => {
        setConnectDialog(null);
        refreshAccounts(type);
    };

    const handleDisconnect = async (type, accountId) => {
        try {
            const left = await disconnect(type, accountId);
            if (left && left.length === 0) setSelectedChat(p => (p?.messengerType === type ? null : p));
        } catch {
            toast(t('Не вдалося відключити акаунт'), 'error');
        }
    };

    const handleSelectChat = (chat) => {
        setSelectedChat(chat);
        if (chat.messengerType === 'TELEGRAM' && chat.unreadCount > 0) {
            telegramService.markAsRead(chat.externalChatId).catch(() => { /* the next poll corrects the count */ });
            setChatsOf('TELEGRAM', p => p.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
        }
    };

    const search = useHistorySearch(searchQuery, searchMode, networkOf(filter));

    const handleSync = async () => {
        setSyncing(true);
        try {
            if (accounts.TELEGRAM.length) { await telegramService.sync(); loadChats('TELEGRAM'); }
            if (accounts.SLACK.length) { await slackService.sync(); loadChats('SLACK'); }
            toast(t('Чати синхронізовано'), 'success');
        } catch {
            toast(t('Синхронізація не вдалася'), 'error');
        } finally { setSyncing(false); }
    };

    const handleTogglePin = async (chat) => {
        if (chat.messengerType !== 'TELEGRAM') return;
        try {
            const res = await telegramService.togglePin(chat.externalChatId);
            const isPinned = res.data.isPinned;
            setChatsOf('TELEGRAM', prev => prev.map(c => c.id === chat.id ? { ...c, isPinned } : c));
        } catch {
            toast(t('Не вдалося закріпити чат'), 'error');
        }
    };

    /**
     * Chats with a person on the other side. `chatKind` comes from the messenger; chats synced
     * before it existed have none and are kept.
     */
    const isPerson = (chat) => chat.chatKind == null || chat.chatKind === 'PERSON';

    const inScope = everyChat
        .filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter(c => matchesScope(c, filter));

    // What the people-only filter is costing right now, shown next to the toggle.
    const hiddenByPeopleOnly = inScope.length - inScope.filter(isPerson).length;

    // A tab other than "all" says exactly what to show, so the people-only switch steps aside.
    const KIND_OF = (c) => (c.chatKind == null ? 'PERSON' : c.chatKind);
    const kindCounts = inScope.reduce((acc, c) => { acc[KIND_OF(c)] = (acc[KIND_OF(c)] || 0) + 1; return acc; }, {});
    const allChats = inScope
        .filter(c => (kindTab === 'ALL' ? (!peopleOnly || isPerson(c)) : KIND_OF(c) === kindTab))
        .sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
        });

    /**
     * Opens a chat by database id, looked up in the unfiltered list so search hits stay reachable.
     */
    const openChatById = (chatId) => {
        const chat = everyChat.find(c => c.id === chatId);
        if (chat) handleSelectChat(chat);
    };

    const handleOpenSearchHit = (hit) => openChatById(hit.chatId);

    /** "Find similar" from a message: a meaning search over every network, in the sidebar. */
    const handleFindSimilar = (text) => {
        setSearchMode('semantic');
        setSearchQuery(text.slice(0, 200));
        if (narrow) setSelectedChat(null);
        toast(t('Шукаю схожі за змістом у всіх чатах'), 'info');
    };

    /** The size of the inbox in the current scope — not of the name search, which may be empty. */
    const scopeTotal = everyChat.filter(c => matchesScope(c, filter)).length;

    const paletteActions = [
        { label: t('Написати повідомлення…'), icon: <EditOutlinedIcon fontSize="small" />, run: () => setOpenComposeDialog(true), keywords: ['compose', t('нове')] },
        { label: t('Підключити месенджер'), icon: <AddIcon fontSize="small" />, run: () => setOpenAddAccountDialog(true), keywords: [t('акаунт'), 'telegram', 'slack', 'whatsapp'] },
        { label: t('Стан системи'), icon: <MonitorHeartOutlinedIcon fontSize="small" />, run: () => setOpenSystemStatus(true), keywords: [t('статус'), t('сервіси'), 'ollama'] },
        { label: t('Аналітика чатів'), icon: <InsightsIcon fontSize="small" />, run: () => navigate('/analytics'), keywords: [t('аналіз'), t('дайджест')] },
        { label: t('Контакти між мережами'), icon: <PeopleAltOutlinedIcon fontSize="small" />, run: () => setOpenContactsDialog(true) },
        { label: t('Синхронізувати чати'), icon: <SyncIcon fontSize="small" />, run: handleSync, keywords: [t('оновити')] },
        { label: mode === 'dark' ? t('Світла тема') : t('Темна тема'), icon: <DarkModeOutlinedIcon fontSize="small" />, run: () => setMode(mode === 'dark' ? 'light' : 'dark'), keywords: [t('тема'), 'dark', 'light', t('темна'), t('світла')] },
        { label: presenting ? t('Вимкнути режим презентації') : t('Режим презентації'), icon: <VisibilityOffOutlinedIcon fontSize="small" />, run: () => setPresenting(!presenting), keywords: [t('захист'), t('приховати'), t('проектор'), 'presentation', 'ctrl+shift+h'] },
        { label: t('Налаштування'), icon: <SettingsOutlinedIcon fontSize="small" />, run: () => navigate('/settings'), keywords: [t('профіль'), t('пароль'), 'settings', t('акаунт')] },
        { label: t('Вийти'), icon: <LogoutIcon fontSize="small" />, run: logout, keywords: ['logout'] },
    ];

    const KIND_TABS = [['ALL', t('Усі')], ['PERSON', t('Особисті')], ['GROUP', t('Групи')], ['CHANNEL', t('Канали')], ['BOT', t('Боти')]];

    /**
     * The contact behind the open chat. Identities whose chat is not loaded (disconnected account)
     * are dropped.
     */
    const openChatContact = selectedChat
        ? contacts.find(c => c.identities.some(i => i.chatId === selectedChat.id))
        : null;

    /**
     * Compose targets as people: chats linked to one contact collapse into one entry; channels and
     * service accounts are left out.
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
    const isSearchingHistory = searchQuery.trim().length >= MIN_QUERY;

    /** The network mark on each row is only needed once more than one network is connected. */
    const hasMultipleNetworks = connectedTypes.length > 1;

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
     * The five networks in one list, so every filter, counter and account chip is derived from it.
     */
    const NETWORKS = NETWORK_TYPES.map(type => ({
        type,
        accounts: accounts[type],
        chats: chats[type],
        onDisconnect: (accountId) => handleDisconnect(type, accountId),
    }));

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
     * Account names for networks with more than one account, where they are what tells two rows
     * apart.
     */
    const accountLabelById = Object.fromEntries(
        NETWORKS.filter(network => network.accounts.length > 1)
            .flatMap(network => network.accounts.map(account => [
                account.id,
                account.accountLabel || account.username || MESSENGER_LABELS[network.type],
            ])));

    const unreadByAccount = Object.fromEntries(
        Object.entries(tallyByAccount).map(([id, tally]) => [id, tally.unread]));


    return (
        <Box sx={(t) => ({ display: 'flex', height: '100vh', bgcolor: t.c.bg, overflow: 'hidden' })}>

            {/* Sidebar. On a phone-width screen the list and the chat take turns. */}
            <Box
                component="aside"
                sx={(t) => ({
                    width: narrow ? '100%' : 330, flexShrink: 0,
                    display: narrow && selectedChat ? 'none' : 'flex', flexDirection: 'column',
                    bgcolor: t.c.surfaceAlt,
                    borderRight: `1px solid ${t.c.border}`,
                })}
            >
                <SidebarHeader
                    chatCount={scopeTotal}
                    totalUnread={totalUnread}
                    syncing={syncing}
                    accounts={connectedAccounts}
                    onSync={handleSync}
                    onContacts={() => setOpenContactsDialog(true)}
                    onSystemStatus={() => setOpenSystemStatus(true)}
                    onAccounts={() => setOpenAccountsDialog(true)}
                    onCompose={() => setOpenComposeDialog(true)}
                    onAnalytics={() => navigate('/analytics')}
                    onSettings={() => navigate('/settings')}
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

                {!isSearchingHistory && scopeTotal > 0 && (
                    <Box
                        onWheel={(e) => { if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY; }}
                        sx={{
                            display: 'flex', gap: 0.5, px: 2, pb: 1, overflowX: 'auto', flexShrink: 0,
                            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
                            // The fade shows the row continues past the edge.
                            maskImage: 'linear-gradient(to right, #000 85%, transparent)',
                        }}>
                        {KIND_TABS.filter(([key]) => key === 'ALL' || kindCounts[key]).map(([key, label]) => (
                            <Box key={key} role="button" tabIndex={0}
                                 onClick={() => setKindTab(key)}
                                 onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setKindTab(key)}
                                 sx={(t) => ({
                                     display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
                                     px: 1.1, py: 0.4, borderRadius: '999px', cursor: 'pointer',
                                     fontSize: 12, fontWeight: kindTab === key ? 700 : 550,
                                     color: kindTab === key ? t.c.onAccent : t.c.textMuted,
                                     bgcolor: kindTab === key ? t.c.accent : t.c.surfaceSunken,
                                     transition: 'background-color .12s',
                                     '&:hover': kindTab === key ? {} : { bgcolor: t.c.surfaceActive },
                                 })}>
                                {label}
                                {key !== 'ALL' && <Box component="span" sx={{ opacity: 0.7, fontWeight: 600 }}>{kindCounts[key]}</Box>}
                            </Box>
                        ))}
                    </Box>
                )}

                {/* `flex: 1 1 0` rather than `flexGrow: 1`: with an auto basis the list would claim
                   its full height and squeeze the filters above it. */}
                <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', pb: 1 }}>
                    {isSearchingHistory ? (
                        <>
                            {/* While searching, the list above is the chat-name match and the
                                section below is the history match — labelled so they don't read
                                as one ranking. */}
                            {allChats.length > 0 && (
                                <>
                                    <SectionLabel>{t('Чати')}</SectionLabel>
                                    <List sx={{ p: 0 }}>{chatListItems}</List>
                                </>
                            )}
                            <MessageSearchResults
                                results={search.results}
                                total={search.total}
                                loading={search.loading}
                                error={search.error}
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


            {/* Main area */}
            {selectedChat
                ? <ChatWindow
                    chat={selectedChat}
                    onClose={() => setSelectedChat(null)}
                    contactName={openChatContact?.displayName}
                    linkedIdentities={linkedIdentities}
                    accountLabels={accountLabelById}
                    onOpenLinked={openChatById}
                    onAnalyse={() => setOpenAnalysisDialog(true)}
                    onFindSimilar={handleFindSimilar}
                  />
                : !narrow && <WelcomeScreen
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
                    onOpenChat={openChatById}
                    onOpenPalette={() => setOpenPalette(true)}
                  />
            }

            <CommandPalette
                open={openPalette}
                onClose={() => setOpenPalette(false)}
                chats={everyChat}
                actions={paletteActions}
                onOpenChat={openChatById}
            />

            <TelegramDialog open={connectDialog === 'TELEGRAM'} onClose={() => setConnectDialog(null)} onConnected={() => handleConnected('TELEGRAM')} />
            <WhatsAppDialog open={connectDialog === 'WHATSAPP'} onClose={() => setConnectDialog(null)} onConnected={() => handleConnected('WHATSAPP')} />
            {['SLACK', 'DISCORD', 'VIBER'].map(type => (
                <TokenConnectDialog key={type} type={type} open={connectDialog === type}
                                    onClose={() => setConnectDialog(null)} onConnected={() => handleConnected(type)} />
            ))}
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
            <AddAccountDialog open={openAddAccountDialog} onClose={() => setOpenAddAccountDialog(false)} onSelect={setConnectDialog} />
            <SystemStatusDialog open={openSystemStatus} onClose={() => setOpenSystemStatus(false)} />
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