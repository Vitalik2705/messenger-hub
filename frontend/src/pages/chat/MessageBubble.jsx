import { Box, Avatar, Typography, IconButton, Tooltip } from '@mui/material';
import MessageMedia from './MessageMedia';
import ReplyIcon from '@mui/icons-material/Reply';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { MESSENGER_COLORS, radius, numeric } from '../../theme/tokens';
import { formatClock, avatarTint, initialsOf } from '../../utils/format';

/** Sent versus read, at the size of a footnote — it is confirmation, not content. */
function MessageStatus({ isRead }) {
    if (isRead === null || isRead === undefined) return null;
    const Icon = isRead ? DoneAllIcon : DoneIcon;
    return (
        <Icon sx={(t) => ({
            fontSize: 13,
            color: isRead ? t.c.accent : t.c.textFaint,
            flexShrink: 0,
        })} />
    );
}

/** `tint` is optional: without one the quote takes the app's accent, which is what a
 *  quote inside the user's own message should use. */
function ReplyBlock({ replyToText, replyToSenderName, tint }) {
    return (
        <Box sx={(t) => ({
            display: 'flex', mb: 0.75,
            pl: 1, py: 0.5, pr: 1,
            borderLeft: `2px solid ${tint || t.c.accent}`,
            bgcolor: t.c.surfaceSunken,
            borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
            minWidth: 0,
        })}>
            <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={(t) => ({ fontSize: 11, fontWeight: 700, color: tint || t.c.accent })}>
                    {replyToSenderName || 'Невідомий'}
                </Typography>
                <Typography noWrap sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint, lineHeight: 1.4 })}>
                    {replyToText || 'Медіа'}
                </Typography>
            </Box>
        </Box>
    );
}

/**
 * One message.
 *
 * Hover actions are revealed by CSS rather than by walking the DOM and assigning
 * `style.opacity` on mouse enter, which is what the previous version did — that broke
 * whenever React re-rendered mid-hover and left buttons stuck visible.
 */
export default function MessageBubble({ message, chat, onReply, onDelete, onOpenMedia,
                                        runEnds = true, runStarts = true, transcript }) {
    const isUser = message.isFromUser;
    const hasText = Boolean(message.text);
    const hasMedia = Boolean(message.mediaType);
    const mediaOnly = hasMedia && !hasText;
    const hasReply = Boolean(message.replyToMessageId);
    /**
     * A sticker gets no bubble.
     *
     * It is a transparent cutout, and a white rounded card behind it reads as an empty box
     * with something small lost in the middle — which is exactly what it looked like.
     */
    const bare = message.mediaType === 'sticker' && !hasText && !hasReply;
    const networkColor = MESSENGER_COLORS[chat.messengerType] || '#8A8F98';

    const senderName = message.senderName || chat.name;

    return (
        <Box sx={{
            display: 'flex',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            alignItems: 'flex-end',
            gap: 0.75,
            // Tight inside a run, loose between runs — the gap is what separates speakers.
            mb: runEnds ? 1 : 0.2,
            '&:hover .msg-actions': { opacity: 1, pointerEvents: 'auto' },
        }}>
            {/* Held open even when the avatar is hidden, so a run stays in one column
                instead of stepping left on every line but its last. */}
            {!isUser && !runEnds && <Box sx={{ width: 26, flexShrink: 0 }} />}

            {!isUser && runEnds && (
                <Avatar
                    variant="rounded"
                    sx={(t) => ({
                        width: 26, height: 26, flexShrink: 0, mb: 0.25,
                        borderRadius: `${radius.md}`,
                        bgcolor: avatarTint(chat.messengerType),
                        color: networkColor,
                        fontSize: 10, fontWeight: 750,
                        border: `1px solid ${t.c.border}`,
                    })}
                >
                    {chat.chatType === 'PERSONAL' && chat.avatarBase64
                        ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt=""
                               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initialsOf(senderName)}
                </Avatar>
            )}

            {/* Actions sit on the side the message came from, so they never cover the text
                and never jump between sides as the conversation alternates. */}
            {isUser && <Actions onReply={() => onReply?.(message)} onDelete={() => onDelete?.(message)} />}

            <Box sx={{ maxWidth: 'min(68%, 640px)', minWidth: 0 }}>
                {/* Named once per run: repeating it on every line of a burst is noise. */}
                {runStarts && !isUser && message.senderName && chat.chatType !== 'PERSONAL' && (
                    <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 0.35, ml: 0.25, color: networkColor }}>
                        {message.senderName}
                    </Typography>
                )}

                <Box sx={(t) => ({
                    px: bare ? 0 : mediaOnly && !hasReply ? 0.5 : 1.4,
                    pt: bare ? 0 : mediaOnly && !hasReply ? 0.5 : 0.9,
                    pb: bare ? 0 : mediaOnly ? 0.5 : 0.7,
                    bgcolor: bare ? 'transparent' : isUser ? t.c.accentSoft : t.c.surface,
                    border: `1px solid ${bare || isUser ? 'transparent' : t.c.border}`,
                    borderRadius: isUser
                        ? `${radius.lg} ${radius.lg} ${radius.sm} ${radius.lg}`
                        : `${radius.lg} ${radius.lg} ${radius.lg} ${radius.sm}`,
                    overflow: 'hidden',
                    // Shrink to the media rather than reserving the full 68% column, which is
                    // what left a wide empty card beside a small image.
                    width: 'fit-content',
                    ...(isUser ? { ml: 'auto' } : {}),
                })}>
                    {hasReply && (
                        <ReplyBlock
                            replyToText={message.replyToText}
                            replyToSenderName={message.replyToSenderName}
                            tint={isUser ? undefined : networkColor}
                        />
                    )}

                    {hasText && (
                        <Typography sx={(t) => ({
                            fontSize: 13.5, lineHeight: 1.55, color: t.c.text,
                            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                        })}>
                            {message.text}
                        </Typography>
                    )}

                    {hasMedia && <MessageMedia message={message} chat={chat} onOpen={onOpenMedia}
                                               transcript={transcript} />}

                    <Box sx={{
                        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.4,
                        mt: hasText ? 0.3 : 0.2,
                        px: mediaOnly ? 0.75 : 0,
                    }}>
                        <Typography sx={(t) => ({ ...numeric, fontSize: 10, color: t.c.textFaint, lineHeight: 1 })}>
                            {formatClock(message.timestamp)}
                        </Typography>
                        {isUser && <MessageStatus isRead={message.isRead} />}
                    </Box>
                </Box>
            </Box>

            {!isUser && <Actions onReply={() => onReply?.(message)} />}
        </Box>
    );
}

function Actions({ onReply, onDelete }) {
    return (
        <Box className="msg-actions" sx={{
            display: 'flex', gap: 0.25, flexShrink: 0, mb: 0.25,
            opacity: 0, pointerEvents: 'none',
            transition: 'opacity .12s',
        }}>
            <Tooltip title="Відповісти">
                <IconButton size="small" onClick={onReply} sx={{ width: 26, height: 26 }}>
                    <ReplyIcon sx={{ fontSize: 15 }} />
                </IconButton>
            </Tooltip>
            {onDelete && (
                <Tooltip title="Видалити">
                    <IconButton
                        size="small" onClick={onDelete}
                        sx={(t) => ({ width: 26, height: 26, '&:hover': { color: t.c.danger, bgcolor: t.c.accentSoft } })}
                    >
                        <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
}
