import { Box, Avatar, Typography } from '@mui/material';
import MessageMedia from './MessageMedia';
import ReplyIcon from '@mui/icons-material/Reply';

const gradients = ['linear-gradient(135deg,#f6d365,#fda085)','linear-gradient(135deg,#a1c4fd,#c2e9fb)','linear-gradient(135deg,#fd7043,#ff8a65)','linear-gradient(135deg,#81c784,#a5d6a7)','linear-gradient(135deg,#ce93d8,#f48fb1)','linear-gradient(135deg,#4db6ac,#80cbc4)','linear-gradient(135deg,#ffb74d,#ffa726)'];
const gradientFor = n => gradients[(n?.charCodeAt(0)||0) % gradients.length];
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

const MessageStatus = ({ isRead }) => {
    if (isRead === null || isRead === undefined) return null;
    if (isRead) {
        // Read — two coral ticks
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
                <Typography sx={{ fontSize: 11, lineHeight: 1, color: '#e8470a', fontWeight: 700 }}>✓</Typography>
                <Typography sx={{ fontSize: 11, lineHeight: 1, color: '#e8470a', fontWeight: 700 }}>✓</Typography>
            </Box>
        );
    }
    // Sent but not read — single gray tick
    return (
        <Typography sx={{ fontSize: 11, lineHeight: 1, color: '#c4b5a0', flexShrink: 0 }}>✓</Typography>
    );
};

const ReplyBlock = ({ replyToText, replyToSenderName, isUser }) => (
    <Box sx={{
        display: 'flex', mb: 0.6, pl: 1, py: 0.5, pr: 1,
        borderLeft: `3px solid ${isUser ? '#e8470a' : '#0088cc'}`,
        bgcolor: isUser ? 'rgba(232,71,10,0.06)' : 'rgba(0,136,204,0.06)',
        borderRadius: '0 6px 6px 0',
    }}>
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, mb: 0.2, color: isUser ? '#e8470a' : '#0088cc', fontFamily: '"DM Sans", sans-serif' }}>
                {replyToSenderName || 'Unknown'}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: '#9a8878', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, fontFamily: '"DM Sans", sans-serif' }}>
                {replyToText || '📎 Media'}
            </Typography>
        </Box>
    </Box>
);

const ReplyButton = ({ onClick, flip }) => (
    <Box
        className="reply-btn"
        onClick={onClick}
        sx={{
            opacity: 0, transition: 'opacity 0.15s', cursor: 'pointer',
            width: 26, height: 26, borderRadius: '50%',
            bgcolor: '#f0e8de', border: '1px solid #e4ddd4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, mb: 0.3,
            '&:hover': { bgcolor: '#e8ddd0' },
        }}
    >
        <ReplyIcon sx={{ fontSize: 14, color: '#8c6a50', transform: flip ? 'scaleX(-1)' : 'none' }} />
    </Box>
);

const MessageBubble = ({ message, chat, accentColor, onReply }) => {
    const isUser = message.isFromUser;
    const hasText = !!message.text;
    const hasMedia = !!message.mediaType;
    const mediaOnly = hasMedia && !hasText;
    const hasReply = !!message.replyToMessageId;

    return (
        <Box
            sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 1, mb: 0.6 }}
            onMouseEnter={e => { e.currentTarget.querySelectorAll('.reply-btn').forEach(b => b.style.opacity = '1'); }}
            onMouseLeave={e => { e.currentTarget.querySelectorAll('.reply-btn').forEach(b => b.style.opacity = '0'); }}
        >
            {!isUser && (
                <Avatar sx={{ width: 26, height: 26, flexShrink: 0, mb: 0.3, background: chat.avatarBase64 && chat.chatType === 'PERSONAL' ? 'none' : gradientFor(message.senderName || chat.name), fontSize: '0.65rem', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                    {chat.chatType === 'PERSONAL' && chat.avatarBase64
                        ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (message.senderName || chat.name)?.charAt(0)?.toUpperCase() || '?'}
                </Avatar>
            )}

            {!isUser && <ReplyButton onClick={() => onReply?.(message)} flip={false} />}

            <Box sx={{ maxWidth: '68%', minWidth: 0 }}>
                {!isUser && message.senderName && chat.chatType !== 'PERSONAL' && (
                    <Typography sx={{ fontSize: 10, fontWeight: 700, mb: 0.4, ml: 0.5, color: accentColor, fontFamily: '"DM Sans", sans-serif' }}>
                        {message.senderName}
                    </Typography>
                )}

                <Box sx={{
                    px: mediaOnly && !hasReply ? 0.5 : 1.6,
                    pt: mediaOnly && !hasReply ? 0.5 : 1,
                    pb: mediaOnly ? 0 : 0.8,
                    bgcolor: isUser ? '#fde8e0' : 'white',
                    border: `1px solid ${isUser ? '#f4c0a8' : '#ede8e1'}`,
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    boxShadow: '0 1px 6px rgba(26,18,8,0.06)',
                    overflow: 'hidden',
                }}>
                    {hasReply && (
                        <ReplyBlock
                            replyToText={message.replyToText}
                            replyToSenderName={message.replyToSenderName}
                            isUser={isUser}
                        />
                    )}

                    {hasText && (
                        <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: '#2d1f0f', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: '"DM Sans", sans-serif' }}>
                            {message.text}
                        </Typography>
                    )}
                    {hasMedia && <MessageMedia message={message} />}

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: hasText ? 0.4 : (mediaOnly ? 0.3 : 0), px: mediaOnly ? 1 : 0, pb: mediaOnly ? 0.5 : 0 }}>
                        <Typography sx={{ fontSize: 10, color: '#c4b5a0', lineHeight: 1, fontFamily: '"DM Sans", sans-serif' }}>
                            {fmtTime(message.timestamp)}
                        </Typography>
                        {isUser && <MessageStatus isRead={message.isRead} />}
                    </Box>
                </Box>
            </Box>

            {isUser && <ReplyButton onClick={() => onReply?.(message)} flip={true} />}
        </Box>
    );
};

export default MessageBubble;