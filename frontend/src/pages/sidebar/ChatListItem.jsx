import { Box, Avatar, Typography } from '@mui/material';
import TelegramIcon from '@mui/icons-material/Telegram';
import { SiSlack } from 'react-icons/si';

const gradients = [
    'linear-gradient(135deg, #f6d365, #fda085)',
    'linear-gradient(135deg, #a1c4fd, #c2e9fb)',
    'linear-gradient(135deg, #fd7043, #ff8a65)',
    'linear-gradient(135deg, #81c784, #a5d6a7)',
    'linear-gradient(135deg, #ce93d8, #f48fb1)',
    'linear-gradient(135deg, #4db6ac, #80cbc4)',
    'linear-gradient(135deg, #ffb74d, #ffa726)',
    'linear-gradient(135deg, #90caf9, #64b5f6)',
];
const gradientFor = n => gradients[(n?.charCodeAt(0) || 0) % gradients.length];

const formatTime = (d) => {
    if (!d) return '';
    const date = new Date(d), now = new Date();
    const h = (now - date) / 3600000;
    if (h < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (h < 48) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const ChatListItem = ({ chat, isSelected, onClick }) => {
    const hasUnread = (chat.unreadCount || 0) > 0;
    const isTg = chat.messengerType === 'TELEGRAM';

    return (
        <Box onClick={onClick} sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 3, py: 1.2, cursor: 'pointer', position: 'relative',
            bgcolor: isSelected ? '#f0e8de' : 'transparent',
            borderLeft: `3px solid ${isSelected ? '#e8470a' : 'transparent'}`,
            transition: 'all 0.12s',
            '&:hover': { bgcolor: isSelected ? '#f0e8de' : '#f5f0eb' },
        }}>
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
                <Avatar sx={{
                    width: 44, height: 44,
                    background: chat.avatarBase64 ? 'none' : gradientFor(chat.name),
                    fontSize: '0.9rem', fontWeight: 700, overflow: 'hidden',
                    boxShadow: hasUnread ? `0 0 0 2px ${isTg ? '#0088cc' : '#611f69'}` : '0 1px 4px rgba(0,0,0,0.1)',
                }}>
                    {chat.avatarBase64
                        ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt={chat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : chat.name?.charAt(0)?.toUpperCase() || '?'}
                </Avatar>
                <Box sx={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 16, height: 16, borderRadius: '50%',
                    bgcolor: isTg ? '#0088cc' : '#611f69',
                    border: '2px solid #faf7f4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {isTg ? <TelegramIcon sx={{ fontSize: 9, color: 'white' }} /> : <SiSlack size={8} color="white" />}
                </Box>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.3 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: hasUnread ? 700 : 500, color: hasUnread ? '#1a1208' : '#5c4a38', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155, fontFamily: '"DM Sans", sans-serif' }}>
                        {chat.name}
                    </Typography>
                    <Typography sx={{ fontSize: 10.5, color: hasUnread ? '#e8470a' : '#b0a090', fontWeight: hasUnread ? 600 : 400, flexShrink: 0, ml: 0.5 }}>
                        {formatTime(chat.lastMessageAt)}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 12, color: '#9a8878', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 175, fontFamily: '"DM Sans", sans-serif' }}>
                        {chat.lastMessage || 'No messages yet'}
                    </Typography>
                    {hasUnread && (
                        <Box sx={{ minWidth: 18, height: 18, borderRadius: 9, bgcolor: '#e8470a', color: 'white', fontSize: 10, fontWeight: 700, flexShrink: 0, ml: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 0.6 }}>
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default ChatListItem;