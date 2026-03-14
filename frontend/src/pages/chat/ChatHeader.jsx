import { Box, Avatar, Typography, IconButton, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TelegramIcon from '@mui/icons-material/Telegram';
import { SiSlack } from 'react-icons/si';

const gradients = ['linear-gradient(135deg,#f6d365,#fda085)','linear-gradient(135deg,#a1c4fd,#c2e9fb)','linear-gradient(135deg,#fd7043,#ff8a65)','linear-gradient(135deg,#81c784,#a5d6a7)','linear-gradient(135deg,#ce93d8,#f48fb1)'];
const gradientFor = n => gradients[(n?.charCodeAt(0)||0) % gradients.length];

const ChatHeader = ({ chat, userStatus, onClose }) => {
    const isTg = chat.messengerType === 'TELEGRAM';
    const isOnline = userStatus?.status === 'online';
    const isLive = chat.chatType !== 'PERSONAL' || !isTg;

    return (
        <Box sx={{
            px: 3, py: 1.8, display: 'flex', alignItems: 'center', gap: 1.5,
            bgcolor: '#faf7f4', borderBottom: '1px solid #ede8e1', flexShrink: 0, zIndex: 10,
            boxShadow: '0 1px 8px rgba(26,18,8,0.04)',
        }}>
            <Box sx={{ position: 'relative' }}>
                <Avatar sx={{ width: 42, height: 42, background: chat.avatarBase64 ? 'none' : gradientFor(chat.name), fontSize: '0.95rem', fontWeight: 700, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    {chat.avatarBase64 ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt={chat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : chat.name?.charAt(0)?.toUpperCase() || '?'}
                </Avatar>
                {(isOnline || isLive) && <Box sx={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', bgcolor: '#22c55e', border: '2px solid #faf7f4', boxShadow: '0 0 5px #22c55e' }} />}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: '#1a1208', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }}>
                        {chat.name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, bgcolor: isTg ? '#e8f4fb' : '#f5eef6', border: `1px solid ${isTg ? '#b8dcf0' : '#dfc0e0'}`, borderRadius: 1, px: 0.8, py: 0.2, flexShrink: 0 }}>
                        {isTg ? <TelegramIcon sx={{ fontSize: 10, color: '#0088cc' }} /> : <SiSlack size={9} color="#611f69" />}
                        <Typography sx={{ fontSize: 9, fontWeight: 700, color: isTg ? '#0070aa' : '#611f69', letterSpacing: '0.04em', fontFamily: '"DM Sans", sans-serif' }}>{chat.messengerType}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {(isOnline || isLive) && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22c55e', animation: 'pulse 2s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } } }} />}
                    <Typography sx={{ fontSize: 11, color: isOnline || isLive ? '#22c55e' : '#b0a090', fontWeight: isOnline || isLive ? 600 : 400, fontFamily: '"DM Sans", sans-serif' }}>
                        {isLive ? 'Live' : isOnline ? 'Online' : userStatus?.last_seen || 'loading...'}
                    </Typography>
                </Box>
            </Box>

            <Tooltip title="Close"><IconButton size="small" onClick={onClose} sx={{ color: '#c4b5a0', width: 32, height: 32, borderRadius: 1.5, '&:hover': { bgcolor: '#fde8e0', color: '#e8470a' }, transition: 'all 0.15s' }}><CloseIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
        </Box>
    );
};

export default ChatHeader;