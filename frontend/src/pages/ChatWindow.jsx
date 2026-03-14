import { useState, useEffect, useRef } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatHeader from './chat/ChatHeader';
import MessageBubble from './chat/MessageBubble';
import websocketService from '../services/websocketService';
import telegramService from '../services/telegramService';
import slackService from '../services/slackService';
import { useAuth } from '../context/AuthContext';

const ChatWindow = ({ chat, onClose }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sending, setSending] = useState(false);
    const [userStatus, setUserStatus] = useState(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const pollingRef = useRef(null);
    const statusPollingRef = useRef(null);
    const isInitialLoad = useRef(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!chat) return;
        setMessages([]); setOffset(0); setHasMore(true); setUserStatus(null);
        loadMessages(); startPolling();
        if (chat.messengerType === 'TELEGRAM' && chat.chatType === 'PERSONAL') { loadUserStatus(); startStatusPolling(); }
        return () => { stopPolling(); stopStatusPolling(); };
    }, [chat?.externalChatId]);

    useEffect(() => { if (isInitialLoad.current && messages.length > 0) { scrollToBottom(); isInitialLoad.current = false; } }, [messages]);
    useEffect(() => { if (user) websocketService.connect(user.id, handleNewMessage); return () => websocketService.disconnect(); }, [user]);

    const startPolling = () => { stopPolling(); pollingRef.current = setInterval(pollNewMessages, 3000); };
    const stopPolling = () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
    const startStatusPolling = () => { stopStatusPolling(); statusPollingRef.current = setInterval(loadUserStatus, 30000); };
    const stopStatusPolling = () => { if (statusPollingRef.current) { clearInterval(statusPollingRef.current); statusPollingRef.current = null; } };

    const loadUserStatus = async () => { try { setUserStatus(await telegramService.getUserStatus(chat.externalChatId)); } catch {} };

    const lazyLoadMedia = (msgs) => {
        if (chat.messengerType !== 'TELEGRAM') return;
        msgs.filter(m => m.mediaType && !m.mediaBase64).forEach(msg => {
            telegramService.getMessageMedia(chat.externalChatId, msg.externalMessageId)
                .then(r => { if (r?.media_base64) setMessages(prev => prev.map(m => m.externalMessageId === msg.externalMessageId ? { ...m, mediaBase64: r.media_base64, mediaMime: r.media_mime || m.mediaMime, fileName: r.file_name || m.fileName, duration: r.duration || m.duration } : m)); })
                .catch(() => {});
        });
    };

    const loadMessages = async () => {
        setLoading(true); isInitialLoad.current = true;
        try {
            let data;
            if (chat.messengerType === 'TELEGRAM') data = await telegramService.getChatMessages(chat.externalChatId, 50, 0);
            else if (chat.messengerType === 'SLACK') data = await slackService.getChatMessages(chat.externalChatId);
            setMessages(data || []); setOffset(50);
            if (!data || data.length < 50) setHasMore(false);
            lazyLoadMedia(data || []);
        } catch {} finally { setLoading(false); }
    };

    const loadMoreMessages = async () => {
        if (loadingMore || !hasMore || chat.messengerType !== 'TELEGRAM') return;
        setLoadingMore(true);
        const container = messagesContainerRef.current;
        const prevH = container?.scrollHeight || 0;
        try {
            const older = await telegramService.getChatMessages(chat.externalChatId, 50, offset);
            if (!older?.length) { setHasMore(false); return; }
            setOffset(p => p + 50);
            setMessages(prev => { const ids = new Set(prev.map(m => m.externalMessageId)); return [...older.filter(m => !ids.has(m.externalMessageId)), ...prev]; });
            if (older.length < 50) setHasMore(false);
            requestAnimationFrame(() => { if (container) container.scrollTop = container.scrollHeight - prevH; });
            lazyLoadMedia(older);
        } catch {} finally { setLoadingMore(false); }
    };

    const pollNewMessages = async () => {
        try {
            let fresh;
            if (chat.messengerType === 'TELEGRAM') fresh = await telegramService.getChatMessages(chat.externalChatId, 50, 0);
            else if (chat.messengerType === 'SLACK') fresh = await slackService.getChatMessages(chat.externalChatId);
            if (!fresh?.length) return;
            setMessages(prev => {
                const ids = new Set(prev.map(m => m.externalMessageId || m.id));
                const newOnes = fresh.filter(m => !ids.has(m.externalMessageId || m.id));
                if (!newOnes.length) return prev;
                lazyLoadMedia(newOnes);
                const c = messagesContainerRef.current;
                if (!c || c.scrollHeight - c.scrollTop - c.clientHeight < 120) setTimeout(scrollToBottom, 50);
                return [...prev, ...newOnes];
            });
        } catch {}
    };

    const handleNewMessage = (msg) => { if (msg.chatId === chat?.id) setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]); };
    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;
        setSending(true);
        const text = newMessage; setNewMessage(''); inputRef.current?.focus();
        try {
            if (chat.messengerType === 'TELEGRAM') await telegramService.sendMessage(chat.externalChatId, text);
            else if (chat.messengerType === 'SLACK') await slackService.sendMessage(chat.externalChatId, text);
            setTimeout(pollNewMessages, 600);
        } catch { setNewMessage(text); } finally { setSending(false); }
    };

    const formatDate = (ts) => {
        if (!ts) return '';
        const d = new Date(ts), diff = (new Date() - d) / 86400000;
        if (diff < 1) return 'Today';
        if (diff < 2) return 'Yesterday';
        return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    };

    const isTg = chat?.messengerType === 'TELEGRAM';
    const accentColor = isTg ? '#0088cc' : '#611f69';
    if (!chat) return null;

    return (
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f5f0eb', overflow: 'hidden', position: 'relative' }}>
            {/* Subtle pattern */}
            <Box sx={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.4,
                backgroundImage: `radial-gradient(#d4c9bc 1px, transparent 1px)`,
                backgroundSize: '20px 20px',
            }} />

            <ChatHeader chat={chat} userStatus={userStatus} onClose={onClose} />

            {/* Messages */}
            <Box ref={messagesContainerRef} onScroll={e => { if (e.target.scrollTop < 80) loadMoreMessages(); }} sx={{ flexGrow: 1, overflow: 'auto', px: 3, py: 2, zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#d4c9bc', borderRadius: 2 } }}>
                {loading ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Box sx={{ width: 34, height: 34, border: `2.5px solid #f4c0a8`, borderTopColor: '#e8470a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', mx: 'auto', mb: 2, '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
                            <Typography sx={{ color: '#b0a090', fontSize: 13, fontFamily: '"DM Sans", sans-serif' }}>Loading messages...</Typography>
                        </Box>
                    </Box>
                ) : messages.length === 0 ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 40, mb: 2, opacity: 0.3 }}>✉️</Typography>
                            <Typography sx={{ color: '#9a8878', fontSize: 14, fontWeight: 500, fontFamily: '"DM Sans", sans-serif' }}>No messages yet</Typography>
                            <Typography sx={{ color: '#b0a090', fontSize: 12, mt: 0.5, fontFamily: '"DM Sans", sans-serif' }}>Send the first message</Typography>
                        </Box>
                    </Box>
                ) : (
                    <Box>
                        {loadingMore && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><Box sx={{ width: 18, height: 18, border: '2px solid #f4c0a8', borderTopColor: '#e8470a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} /></Box>}
                        {!hasMore && <Box sx={{ textAlign: 'center', py: 2 }}><Typography sx={{ fontSize: 11, color: '#c4b5a0', fontFamily: '"DM Sans", sans-serif' }}>— Beginning of conversation —</Typography></Box>}

                        {messages.map((msg, i) => {
                            const showDate = i === 0 || new Date(messages[i-1].timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
                            return (
                                <Box key={msg.externalMessageId || msg.id || i}>
                                    {showDate && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 2.5 }}>
                                            <Box sx={{ flex: 1, height: 1, bgcolor: '#e4ddd4' }} />
                                            <Typography sx={{ fontSize: 10, color: '#b0a090', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', bgcolor: '#f0ebe3', border: '1px solid #e4ddd4', borderRadius: 10, px: 1.5, py: 0.4, fontFamily: '"DM Sans", sans-serif' }}>
                                                {formatDate(msg.timestamp)}
                                            </Typography>
                                            <Box sx={{ flex: 1, height: 1, bgcolor: '#e4ddd4' }} />
                                        </Box>
                                    )}
                                    <MessageBubble message={msg} chat={chat} accentColor={accentColor} />
                                </Box>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </Box>
                )}
            </Box>

            {/* Input */}
            <Box sx={{ px: 2.5, py: 2, bgcolor: '#faf7f4', borderTop: '1px solid #ede8e1', zIndex: 10, flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
                <Box sx={{ flex: 1, bgcolor: 'white', border: '1px solid #e4ddd4', borderRadius: 3, px: 2, py: 1, boxShadow: '0 1px 6px rgba(26,18,8,0.04)', '&:focus-within': { border: '1px solid #c4a882', boxShadow: '0 2px 10px rgba(26,18,8,0.08)' }, transition: 'all 0.15s' }}>
                    <textarea
                        ref={inputRef}
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                        disabled={sending}
                        rows={1}
                        style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: '#2d1f0f', fontSize: 13.5, fontFamily: '"DM Sans", sans-serif', resize: 'none', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}
                        onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                    />
                </Box>
                <IconButton onClick={handleSendMessage} disabled={!newMessage.trim() || sending} sx={{ width: 44, height: 44, flexShrink: 0, bgcolor: newMessage.trim() ? '#e8470a' : '#f0ebe3', color: newMessage.trim() ? 'white' : '#c4b5a0', borderRadius: 2, border: 'none', boxShadow: newMessage.trim() ? '0 4px 14px rgba(232,71,10,0.35)' : 'none', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)', '&:hover': { transform: newMessage.trim() ? 'scale(1.06)' : 'none', bgcolor: newMessage.trim() ? '#d03d08' : '#f0ebe3' }, '&:disabled': { bgcolor: '#f0ebe3', color: '#d4c9bc' } }}>
                    <SendIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Box>
        </Box>
    );
};

export default ChatWindow;