import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import telegramService from '../services/telegramService';
import slackService from '../services/slackService';
import ChatWindow from './ChatWindow';
import ChatListItem from './sidebar/ChatListItem';
import WelcomeScreen from './sidebar/WelcomeScreen';
import TelegramDialog from './dialogs/TelegramDialog';
import SlackDialog from './dialogs/SlackDialog';
import { Box, Typography, IconButton, List, Tooltip } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import SyncIcon from '@mui/icons-material/Sync';
import SearchIcon from '@mui/icons-material/Search';
import TelegramIcon from '@mui/icons-material/Telegram';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { SiSlack } from 'react-icons/si';

const DashboardPage = () => {
    const { logout } = useAuth();
    const [telegramConnected, setTelegramConnected] = useState(false);
    const [telegramChats, setTelegramChats] = useState([]);
    const [slackConnected, setSlackConnected] = useState(false);
    const [slackChats, setSlackChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('ALL');
    const [syncing, setSyncing] = useState(false);
    const [openTelegramDialog, setOpenTelegramDialog] = useState(false);
    const [tgStep, setTgStep] = useState(0);
    const [tgPhone, setTgPhone] = useState('');
    const [tgCode, setTgCode] = useState('');
    const [tgPassword, setTgPassword] = useState('');
    const [tgPhoneCodeHash, setTgPhoneCodeHash] = useState('');
    const [tgSession, setTgSession] = useState('');
    const [tgError, setTgError] = useState('');
    const [tgLoading, setTgLoading] = useState(false);
    const [openSlackDialog, setOpenSlackDialog] = useState(false);
    const [slackToken, setSlackToken] = useState('');
    const [slackError, setSlackError] = useState('');
    const [slackLoading, setSlackLoading] = useState(false);
    const chatPollingRef = useRef(null);

    useEffect(() => { checkStatus(); }, []);
    useEffect(() => {
        if (telegramConnected || slackConnected) startChatPolling();
        else stopChatPolling();
        return () => stopChatPolling();
    }, [telegramConnected, slackConnected]);

    const startChatPolling = () => { stopChatPolling(); chatPollingRef.current = setInterval(pollChats, 5000); };
    const stopChatPolling = () => { if (chatPollingRef.current) { clearInterval(chatPollingRef.current); chatPollingRef.current = null; } };

    const pollChats = async () => {
        try {
            if (telegramConnected) {
                const chats = await telegramService.getChats();
                setTelegramChats(prev => { const m = new Map(prev.map(c => [c.externalChatId, c.avatarBase64])); return chats.map(c => ({ ...c, avatarBase64: m.get(c.externalChatId) || c.avatarBase64 })); });
            }
            if (slackConnected) setSlackChats(await slackService.getChats());
        } catch {}
    };

    const checkStatus = async () => {
        try {
            const tg = await telegramService.getStatus();
            setTelegramConnected(tg.connected);
            if (tg.connected) loadTelegramChats();
            const sl = await slackService.getStatus();
            setSlackConnected(sl.connected);
            if (sl.connected) loadSlackChats();
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

    const handleSendCode = async () => {
        setTgError(''); setTgLoading(true);
        try { const r = await telegramService.sendCode(tgPhone); setTgPhoneCodeHash(r.phone_code_hash); setTgSession(r.session); setTgStep(1); }
        catch (e) { setTgError(e.response?.data?.detail || 'Failed to send code'); }
        finally { setTgLoading(false); }
    };
    const handleSignIn = async () => {
        setTgError(''); setTgLoading(true);
        try { const r = await telegramService.signIn({ phone: tgPhone, code: tgCode, phone_code_hash: tgPhoneCodeHash, session: tgSession }); if (r.requires_password) { setTgSession(r.session); setTgStep(2); } else { setTelegramConnected(true); setOpenTelegramDialog(false); loadTelegramChats(); } }
        catch (e) { setTgError(e.response?.data?.detail || 'Invalid code'); }
        finally { setTgLoading(false); }
    };
    const handleSignInPassword = async () => {
        setTgError(''); setTgLoading(true);
        try { await telegramService.signInPassword({ phone: tgPhone, password: tgPassword, session: tgSession }); setTelegramConnected(true); setOpenTelegramDialog(false); loadTelegramChats(); }
        catch (e) { setTgError(e.response?.data?.detail || 'Wrong password'); }
        finally { setTgLoading(false); }
    };
    const handleDisconnectTelegram = async () => { try { await telegramService.disconnect(); setTelegramConnected(false); setTelegramChats([]); setSelectedChat(p => p?.messengerType === 'TELEGRAM' ? null : p); } catch {} };
    const handleConnectSlack = async () => {
        setSlackError(''); setSlackLoading(true);
        try { await slackService.connect(slackToken); setSlackConnected(true); setOpenSlackDialog(false); loadSlackChats(); }
        catch (e) { setSlackError(e.response?.data?.detail || 'Failed to connect'); }
        finally { setSlackLoading(false); }
    };
    const handleDisconnectSlack = async () => { try { await slackService.disconnect(); setSlackConnected(false); setSlackChats([]); setSelectedChat(p => p?.messengerType === 'SLACK' ? null : p); } catch {} };
    const handleSelectChat = (chat) => {
        setSelectedChat(chat);
        if (chat.messengerType === 'TELEGRAM' && chat.unreadCount > 0) { telegramService.markAsRead(chat.externalChatId).catch(() => {}); setTelegramChats(p => p.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c)); }
    };
    const handleSync = async () => { setSyncing(true); try { if (telegramConnected) { await telegramService.sync(); loadTelegramChats(); } if (slackConnected) { await slackService.sync(); loadSlackChats(); } } catch {} finally { setSyncing(false); } };

    const allChats = [...telegramChats, ...slackChats]
        .filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter(c => filter === 'ALL' || c.messengerType === filter)
        .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    const totalUnread = [...telegramChats, ...slackChats].reduce((s, c) => s + (c.unreadCount || 0), 0);
    const tgUnread = telegramChats.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const slUnread = slackChats.reduce((s, c) => s + (c.unreadCount || 0), 0);

    return (
        <Box sx={{ display: 'flex', height: '100vh', fontFamily: '"DM Sans", sans-serif', bgcolor: '#f5f0eb' }}>
            <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />

            {/* Sidebar */}
            <Box sx={{
                width: 320, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                bgcolor: '#faf7f4',
                borderRight: '1px solid #ede8e1',
                transition: 'width 0.3s ease',
            }}>
                {/* Header */}
                <Box sx={{ px: 3, pt: 3, pb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5 }}>
                        <Box>
                            <Typography sx={{
                                fontFamily: '"Playfair Display", serif',
                                fontSize: 22, fontWeight: 700, color: '#1a1208',
                                lineHeight: 1, letterSpacing: '-0.3px',
                            }}>
                                Messenger Hub
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.8 }}>
                                <Typography sx={{ fontSize: 12, color: '#a89880' }}>
                                    {allChats.length} conversations
                                </Typography>
                                {totalUnread > 0 && (
                                    <Box sx={{ bgcolor: '#e8470a', borderRadius: 10, px: 1, py: 0.15, fontSize: 10, fontWeight: 700, color: 'white' }}>
                                        {totalUnread > 999 ? '999+' : totalUnread}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="Sync"><IconButton size="small" onClick={handleSync} sx={{ color: '#c4b5a0', width: 30, height: 30, borderRadius: 1.5, '&:hover': { bgcolor: '#f0ebe3', color: '#6b5c48' }, animation: syncing ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }}><SyncIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                            <Tooltip title="Logout"><IconButton size="small" onClick={logout} sx={{ color: '#c4b5a0', width: 30, height: 30, borderRadius: 1.5, '&:hover': { bgcolor: '#fde8e0', color: '#e8470a' } }}><LogoutIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                        </Box>
                    </Box>

                    {/* Messenger chips */}
                    <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mb: 2 }}>
                        {telegramConnected ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, bgcolor: '#e8f4fb', border: '1px solid #b8dcf0', borderRadius: 2, px: 1.2, py: 0.5 }}>
                                <TelegramIcon sx={{ fontSize: 12, color: '#0088cc' }} />
                                <Typography sx={{ fontSize: 11, color: '#0070aa', fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>Telegram</Typography>
                                <CloseIcon onClick={handleDisconnectTelegram} sx={{ fontSize: 11, color: '#88bcd4', cursor: 'pointer', '&:hover': { color: '#e8470a' } }} />
                            </Box>
                        ) : (
                            <Box onClick={() => { setTgStep(0); setTgPhone(''); setTgCode(''); setTgPassword(''); setTgError(''); setOpenTelegramDialog(true); }} sx={{ display: 'flex', alignItems: 'center', gap: 0.6, bgcolor: 'transparent', border: '1px dashed #d4c9bc', borderRadius: 2, px: 1.2, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: '#e8f4fb', borderColor: '#b8dcf0', borderStyle: 'solid' }, transition: 'all 0.15s' }}>
                                <AddIcon sx={{ fontSize: 12, color: '#b0a090' }} />
                                <Typography sx={{ fontSize: 11, color: '#b0a090', fontFamily: '"DM Sans", sans-serif' }}>Telegram</Typography>
                            </Box>
                        )}
                        {slackConnected ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, bgcolor: '#f5eef6', border: '1px solid #dfc0e0', borderRadius: 2, px: 1.2, py: 0.5 }}>
                                <SiSlack size={11} color="#611f69" />
                                <Typography sx={{ fontSize: 11, color: '#611f69', fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>Slack</Typography>
                                <CloseIcon onClick={handleDisconnectSlack} sx={{ fontSize: 11, color: '#c09cc4', cursor: 'pointer', '&:hover': { color: '#e8470a' } }} />
                            </Box>
                        ) : (
                            <Box onClick={() => { setSlackError(''); setSlackToken(''); setOpenSlackDialog(true); }} sx={{ display: 'flex', alignItems: 'center', gap: 0.6, bgcolor: 'transparent', border: '1px dashed #d4c9bc', borderRadius: 2, px: 1.2, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: '#f5eef6', borderColor: '#dfc0e0', borderStyle: 'solid' }, transition: 'all 0.15s' }}>
                                <AddIcon sx={{ fontSize: 12, color: '#b0a090' }} />
                                <Typography sx={{ fontSize: 11, color: '#b0a090', fontFamily: '"DM Sans", sans-serif' }}>Slack</Typography>
                            </Box>
                        )}
                    </Box>

                    {/* Search */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f0ebe3', border: '1px solid #e4ddd4', borderRadius: 2.5, px: 1.5, py: 0.9, '&:focus-within': { border: '1px solid #c4a882', bgcolor: '#faf7f4' }, transition: 'all 0.15s' }}>
                        <SearchIcon sx={{ color: '#b0a090', fontSize: 16, flexShrink: 0 }} />
                        <input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ background: 'none', border: 'none', outline: 'none', color: '#3d2e1e', fontSize: 13, width: '100%', fontFamily: '"DM Sans", sans-serif' }} />
                        {searchQuery && <CloseIcon onClick={() => setSearchQuery('')} sx={{ color: '#b0a090', fontSize: 14, cursor: 'pointer' }} />}
                    </Box>
                </Box>

                {/* Filter tabs */}
                <Box sx={{ display: 'flex', px: 3, pb: 1.5, gap: 0.5 }}>
                    {[
                        { key: 'ALL', label: 'All', count: totalUnread },
                        { key: 'TELEGRAM', label: 'Telegram', icon: <TelegramIcon sx={{ fontSize: 11 }} />, count: tgUnread },
                        { key: 'SLACK', label: 'Slack', icon: <SiSlack size={10} />, count: slUnread },
                    ].map(f => {
                        const active = filter === f.key;
                        return (
                            <Box key={f.key} onClick={() => setFilter(f.key)} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.2, py: 0.5, borderRadius: 2, cursor: 'pointer', bgcolor: active ? '#e8470a' : 'transparent', color: active ? 'white' : '#9a8878', fontWeight: active ? 700 : 400, transition: 'all 0.15s', '&:hover': { bgcolor: active ? '#e8470a' : '#f0ebe3', color: active ? 'white' : '#5c4a38' } }}>
                                {f.icon}
                                <Typography sx={{ fontSize: 11, fontWeight: 'inherit', color: 'inherit', fontFamily: '"DM Sans", sans-serif' }}>{f.label}</Typography>
                                {f.count > 0 && <Box sx={{ bgcolor: active ? 'rgba(255,255,255,0.3)' : '#e8470a', borderRadius: 10, px: 0.6, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white' }}>{f.count > 99 ? '99+' : f.count}</Box>}
                            </Box>
                        );
                    })}
                </Box>

                {/* Chat list */}
                <Box sx={{ flexGrow: 1, overflowY: 'auto', '&::-webkit-scrollbar': { width: 3 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#ddd5c8', borderRadius: 2 } }}>
                    {allChats.length === 0 && (telegramConnected || slackConnected) && !syncing ? (
                        <Box sx={{ p: 5, textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 32, mb: 1.5, opacity: 0.4 }}>{searchQuery ? '🔍' : '💬'}</Typography>
                            <Typography sx={{ color: '#b0a090', fontSize: 13, fontWeight: 500 }}>{searchQuery ? 'Nothing found' : 'No conversations'}</Typography>
                        </Box>
                    ) : (
                        <List sx={{ p: '4px 0' }}>
                            {allChats.map(chat => (
                                <ChatListItem key={`${chat.messengerType}-${chat.id}`} chat={chat} isSelected={selectedChat?.id === chat.id} onClick={() => handleSelectChat(chat)} />
                            ))}
                        </List>
                    )}
                </Box>
            </Box>

            {/* Main area */}
            {selectedChat ? <ChatWindow chat={selectedChat} onClose={() => setSelectedChat(null)} /> : <WelcomeScreen telegramConnected={telegramConnected} slackConnected={slackConnected} />}

            <TelegramDialog open={openTelegramDialog} onClose={() => setOpenTelegramDialog(false)} step={tgStep} phone={tgPhone} code={tgCode} password={tgPassword} error={tgError} loading={tgLoading} onPhoneChange={setTgPhone} onCodeChange={setTgCode} onPasswordChange={setTgPassword} onSendCode={handleSendCode} onSignIn={handleSignIn} onSignInPassword={handleSignInPassword} />
            <SlackDialog open={openSlackDialog} onClose={() => setOpenSlackDialog(false)} token={slackToken} onTokenChange={setSlackToken} onConnect={handleConnectSlack} loading={slackLoading} error={slackError} />
        </Box>
    );
};

export default DashboardPage;