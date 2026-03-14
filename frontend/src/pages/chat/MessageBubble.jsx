import { Box, Avatar, Typography } from '@mui/material';
import MessageMedia from './MessageMedia';

const gradients = ['linear-gradient(135deg,#f6d365,#fda085)','linear-gradient(135deg,#a1c4fd,#c2e9fb)','linear-gradient(135deg,#fd7043,#ff8a65)','linear-gradient(135deg,#81c784,#a5d6a7)','linear-gradient(135deg,#ce93d8,#f48fb1)','linear-gradient(135deg,#4db6ac,#80cbc4)','linear-gradient(135deg,#ffb74d,#ffa726)'];
const gradientFor = n => gradients[(n?.charCodeAt(0)||0) % gradients.length];
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

const MessageBubble = ({ message, chat, accentColor }) => {
    const isUser = message.isFromUser;
    const hasText = !!message.text;
    const hasMedia = !!message.mediaType;
    const mediaOnly = hasMedia && !hasText;

    return (
        <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 1, mb: 0.6 }}>
            {!isUser && (
                <Avatar sx={{ width: 26, height: 26, flexShrink: 0, mb: 0.3, background: chat.avatarBase64 && chat.chatType === 'PERSONAL' ? 'none' : gradientFor(message.senderName || chat.name), fontSize: '0.65rem', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                    {chat.chatType === 'PERSONAL' && chat.avatarBase64
                        ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (message.senderName || chat.name)?.charAt(0)?.toUpperCase() || '?'}
                </Avatar>
            )}

            <Box sx={{ maxWidth: '68%', minWidth: 0 }}>
                {!isUser && message.senderName && chat.chatType !== 'PERSONAL' && (
                    <Typography sx={{ fontSize: 10, fontWeight: 700, mb: 0.4, ml: 0.5, color: accentColor, fontFamily: '"DM Sans", sans-serif' }}>{message.senderName}</Typography>
                )}

                <Box sx={{
                    px: mediaOnly ? 0.5 : 1.6, pt: mediaOnly ? 0.5 : 1, pb: mediaOnly ? 0 : 0.8,
                    bgcolor: isUser ? '#fde8e0' : 'white',
                    border: `1px solid ${isUser ? '#f4c0a8' : '#ede8e1'}`,
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    boxShadow: '0 1px 6px rgba(26,18,8,0.06)',
                    overflow: 'hidden',
                }}>
                    {hasText && (
                        <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: '#2d1f0f', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: '"DM Sans", sans-serif' }}>
                            {message.text}
                        </Typography>
                    )}
                    {hasMedia && <MessageMedia message={message} />}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.4, mt: hasText ? 0.4 : (mediaOnly ? 0.3 : 0), px: mediaOnly ? 1 : 0, pb: mediaOnly ? 0.5 : 0 }}>
                        <Typography sx={{ fontSize: 10, color: '#c4b5a0', lineHeight: 1, fontFamily: '"DM Sans", sans-serif' }}>{fmtTime(message.timestamp)}</Typography>
                        {isUser && <Typography sx={{ fontSize: 10, color: '#e8470a', lineHeight: 1 }}>✓✓</Typography>}
                    </Box>
                </Box>
            </Box>

            {isUser && <Box sx={{ width: 26, flexShrink: 0 }} />}
        </Box>
    );
};

export default MessageBubble;