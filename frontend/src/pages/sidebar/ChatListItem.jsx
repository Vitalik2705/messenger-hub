import { useState } from 'react';
import { Box, Avatar, Typography, Menu, MenuItem } from '@mui/material';
import TelegramIcon from '@mui/icons-material/Telegram';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
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

const ChatListItem = ({ chat, isSelected, onClick, onTogglePin }) => {
    const hasUnread = (chat.unreadCount || 0) > 0;
    const isTg = chat.messengerType === 'TELEGRAM';
    const isPinned = chat.isPinned === true;
    const [contextMenu, setContextMenu] = useState(null);

    const handleContextMenu = (e) => {
        e.preventDefault();
        setContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
    };

    const handleClose = () => setContextMenu(null);

    const handlePinToggle = () => {
        onTogglePin?.(chat);
        handleClose();
    };

    return (
        <>
            <Box
                onClick={onClick}
                onContextMenu={handleContextMenu}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    px: 3, py: 1.2, cursor: 'pointer', position: 'relative',
                    bgcolor: isSelected ? '#f0e8de' : isPinned ? '#fdf6f0' : 'transparent',
                    borderLeft: `3px solid ${isSelected ? '#e8470a' : isPinned ? '#f4c0a8' : 'transparent'}`,
                    transition: 'all 0.12s',
                    '&:hover': { bgcolor: isSelected ? '#f0e8de' : '#f5f0eb' },
                }}
            >
                {/* Pin icon top-right */}
                {isPinned && (
                    <Box sx={{ position: 'absolute', top: 7, right: 10, opacity: 0.4 }}>
                        <PushPinIcon sx={{ fontSize: 11, color: '#8c6a50', transform: 'rotate(45deg)' }} />
                    </Box>
                )}

                {/* Avatar */}
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar sx={{
                        width: 44, height: 44,
                        background: chat.avatarBase64 ? 'none' : gradientFor(chat.name),
                        fontSize: '0.9rem', fontWeight: 700, overflow: 'hidden',
                        boxShadow: hasUnread
                            ? `0 0 0 2px ${isTg ? '#0088cc' : '#611f69'}`
                            : '0 1px 4px rgba(0,0,0,0.1)',
                    }}>
                        {chat.avatarBase64
                            ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt={chat.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : chat.name?.charAt(0)?.toUpperCase() || '?'}
                    </Avatar>
                    <Box sx={{
                        position: 'absolute', bottom: -1, right: -1,
                        width: 16, height: 16, borderRadius: '50%',
                        bgcolor: isTg ? '#0088cc' : '#611f69',
                        border: '2px solid #faf7f4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {isTg
                            ? <TelegramIcon sx={{ fontSize: 9, color: 'white' }} />
                            : <SiSlack size={8} color="white" />}
                    </Box>
                </Box>

                {/* Text content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.3 }}>
                        <Typography sx={{
                            fontSize: 13.5, fontWeight: hasUnread ? 700 : 500,
                            color: hasUnread ? '#1a1208' : '#5c4a38',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 145, fontFamily: '"DM Sans", sans-serif',
                        }}>
                            {chat.name}
                        </Typography>
                        <Typography sx={{
                            fontSize: 10.5, flexShrink: 0, ml: 0.5,
                            color: hasUnread ? '#e8470a' : '#b0a090',
                            fontWeight: hasUnread ? 600 : 400,
                        }}>
                            {formatTime(chat.lastMessageAt)}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{
                            fontSize: 12, color: '#9a8878',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 175, fontFamily: '"DM Sans", sans-serif',
                        }}>
                            {chat.lastMessage || 'No messages yet'}
                        </Typography>
                        {hasUnread && (
                            <Box sx={{
                                minWidth: 18, height: 18, borderRadius: 9,
                                bgcolor: '#e8470a', color: 'white',
                                fontSize: 10, fontWeight: 700, flexShrink: 0, ml: 0.5,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', px: 0.6,
                            }}>
                                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* Right-click context menu */}
            <Menu
                open={contextMenu !== null}
                onClose={handleClose}
                anchorReference="anchorPosition"
                anchorPosition={contextMenu !== null
                    ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                    : undefined}
                PaperProps={{
                    sx: {
                        bgcolor: '#faf7f4',
                        border: '1px solid #ede8e1',
                        borderRadius: 2,
                        boxShadow: '0 8px 24px rgba(26,18,8,0.12)',
                        minWidth: 160,
                        py: 0.5,
                    }
                }}
            >
                {/* Only show pin option for Telegram */}
                {isTg && (
                    <MenuItem
                        onClick={handlePinToggle}
                        sx={{
                            fontSize: 13, color: '#3d2e1e', gap: 1.5, py: 1,
                            fontFamily: '"DM Sans", sans-serif',
                            '&:hover': { bgcolor: '#f0e8de' },
                        }}
                    >
                        {isPinned
                            ? <><PushPinOutlinedIcon sx={{ fontSize: 15, color: '#b0a090' }} /> Unpin chat</>
                            : <><PushPinIcon sx={{ fontSize: 15, color: '#b0a090', transform: 'rotate(45deg)' }} /> Pin chat</>
                        }
                    </MenuItem>
                )}
            </Menu>
        </>
    );
};

export default ChatListItem;