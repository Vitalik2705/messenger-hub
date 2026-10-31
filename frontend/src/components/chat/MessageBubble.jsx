import { Box, Avatar, Typography, IconButton, Tooltip, useTheme, alpha } from '@mui/material';
import MessageMedia from './MessageMedia';
import ReplyIcon from '@mui/icons-material/Reply';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { RichText, plainText } from '../../utils/richText';
import { MESSENGER_COLORS, radius, numeric } from '../../theme/tokens';
import { formatClock, avatarTint, initialsOf } from '../../utils/format';
import { usePresentation } from '../../context/PresentationContext';
import { t } from '../../i18n';

/** Sent versus read, at the size of a footnote — it is confirmation, not content. */
function MessageStatus({ isRead, onFill }) {
    if (isRead === null || isRead === undefined) return null;
    const Icon = isRead ? DoneAllIcon : DoneIcon;
    return (
        <Icon sx={(t) => ({
            fontSize: 13,
            color: onFill ? alpha(t.c.onAccent, isRead ? 1 : 0.7) : isRead ? t.c.accent : t.c.textFaint,
            flexShrink: 0,
        })} />
    );
}

/** `tint` is optional: without one the quote takes the app's accent, which is what a
 *  quote inside the user's own message should use. */
function ReplyBlock({ replyToText, replyToSenderName, tint, onFill }) {
    return (
        <Box sx={(t) => ({
            display: 'flex', mb: 0.75,
            pl: 1, py: 0.5, pr: 1,
            borderLeft: `2px solid ${onFill ? t.c.onAccent : tint || t.c.accent}`,
            bgcolor: onFill ? alpha(t.c.onAccent, 0.14) : t.c.surfaceSunken,
            borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
            minWidth: 0,
        })}>
            <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={(t) => ({ fontSize: 11, fontWeight: 700, color: onFill ? t.c.onAccent : tint || t.c.accent })}>
                    {replyToSenderName || t('Невідомий')}
                </Typography>
                <Typography noWrap sx={(t) => ({ fontSize: 11.5, color: onFill ? alpha(t.c.onAccent, 0.8) : t.c.textFaint, lineHeight: 1.4 })}>
                    {plainText(replyToText) || t('Медіа')}
                </Typography>
            </Box>
        </Box>
    );
}

/** One message. Hover actions are shown with CSS so re-renders cannot leave them stuck visible. */
export default function MessageBubble({ message, chat, onReply, onDelete, onOpenMedia,
                                        runEnds = true, runStarts = true, transcript,
                                        onMenu, onReact, highlightQuery, flash }) {
    const isUser = message.isFromUser;
    const hasText = Boolean(message.text);
    // A link preview's picture travels as media but belongs to the preview card, not the bubble.
    const hasMedia = Boolean(message.mediaType) && message.mediaType !== 'webpage';
    const mediaOnly = hasMedia && !hasText;
    const hasReply = Boolean(message.replyToMessageId);
    /** Stickers are transparent cutouts and get no bubble. */
    const bare = message.mediaType === 'sticker' && !hasText && !hasReply;
    /** A picture-only message is drawn edge to edge with its time laid over it. */
    const picture = mediaOnly && !hasReply && (message.mediaType === 'photo' || message.mediaType === 'video');
    const theme = useTheme();
    /**
     * Outgoing text sits on the accent colour in 'filled' bubble mode. Voice notes keep the soft
     * tint because their player is a card of its own.
     */
    const onFill = isUser && !bare && !picture && theme.c.bubbles === 'filled' && message.mediaType !== 'audio';
    const networkColor = MESSENGER_COLORS[chat.messengerType] || '#8A8F98';
    const footer = (
        <>
            <Typography sx={(t) => ({
                ...numeric, fontSize: 10, lineHeight: 1,
                color: onFill ? alpha(t.c.onAccent, 0.75) : t.c.textFaint,
            })}>
                {message.edited ? t('змінено · ') : ''}{formatClock(message.timestamp)}
            </Typography>
            {isUser && <MessageStatus isRead={message.isRead} onFill={onFill || picture} />}
        </>
    );

    const { presenting, name } = usePresentation();
    const senderName = name(message.senderName || chat.name, message.senderName ? undefined : chat.chatKind);

    return (
        <Box
            data-msg={message.externalMessageId || message.id}
            onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(e, message); } : undefined}
            sx={{
            display: 'flex',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            alignItems: 'flex-end',
            gap: 0.75,
            // Tight inside a run, loose between runs — the gap is what separates speakers.
            mb: runEnds ? 1 : 0.2,
            '&:hover .msg-actions': { opacity: 1, pointerEvents: 'auto' },
            animation: 'msgIn .22s ease-out both',
            '@keyframes msgIn': {
                from: { opacity: 0, transform: `translateY(6px) scale(${isUser ? 0.98 : 1})` },
                to: { opacity: 1, transform: 'none' },
            },
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
                    {chat.chatType === 'PERSONAL' && chat.avatarBase64 && !presenting
                        ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt=""
                               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initialsOf(senderName)}
                </Avatar>
            )}

            {/* Actions sit on the side the message came from, so they never cover the text
                and never jump between sides as the conversation alternates. */}
            {isUser && <Actions onReply={() => onReply?.(message)} onDelete={() => onDelete?.(message)}
                                onMore={onMenu ? (e) => onMenu(e, message) : null} />}

            <Box sx={{ maxWidth: 'min(68%, 640px)', minWidth: 0 }}>
                {/* Named once per run: repeating it on every line of a burst is noise. */}
                {runStarts && !isUser && message.senderName && chat.chatType !== 'PERSONAL' && (
                    <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 0.35, ml: 0.25, color: networkColor }}>
                        {senderName}
                    </Typography>
                )}

                <Box data-private sx={(t) => ({
                    px: bare || picture ? 0 : mediaOnly && !hasReply ? 0.5 : 1.4,
                    pt: bare || picture ? 0 : mediaOnly && !hasReply ? 0.5 : 0.9,
                    pb: bare || picture ? 0 : mediaOnly ? 0.5 : 0.7,
                    bgcolor: bare || picture ? 'transparent'
                        : onFill ? t.c.accent
                            : isUser ? t.c.accentSoft : t.c.surface,
                    backgroundImage: onFill ? `linear-gradient(160deg, ${t.c.accent}, ${t.c.accentHover})` : 'none',
                    boxShadow: bare || picture ? 'none' : onFill ? `0 2px 8px ${alpha(t.c.accent, 0.25)}` : t.c.shadow,
                    border: `1px solid ${bare || picture || isUser ? 'transparent' : t.c.border}`,
                    borderRadius: isUser
                        ? `${radius.lg} ${radius.lg} ${radius.sm} ${radius.lg}`
                        : `${radius.lg} ${radius.lg} ${radius.lg} ${radius.sm}`,
                    overflow: 'hidden',
                    // A search hit or a jumped-to message pulses once so the eye finds it.
                    animation: flash ? 'msgFlash 1.6s ease-out' : 'none',
                    '@keyframes msgFlash': {
                        '0%, 40%': { boxShadow: `0 0 0 3px ${t.c.accent}` },
                        '100%': { boxShadow: `0 0 0 0 transparent` },
                    },
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
                            onFill={onFill}
                        />
                    )}

                    {hasText && (
                        <Typography sx={(t) => ({
                            fontSize: 13.5, lineHeight: 1.55, color: onFill ? t.c.onAccent : t.c.text,
                            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                        })}>
                            <RichText text={message.text} query={highlightQuery} onFill={onFill} />
                        </Typography>
                    )}

                    {message.linkPreview && <LinkPreview preview={message.linkPreview} message={message} onFill={onFill} />}

                    {hasMedia && <MessageMedia message={message} chat={chat} onOpen={onOpenMedia}
                                               transcript={transcript} overlay={picture ? footer : null} />}

                    {!picture && (
                        <Box sx={{
                            display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.4,
                            mt: hasText ? 0.3 : 0.2,
                            px: mediaOnly ? 0.75 : 0,
                        }}>
                            {footer}
                        </Box>
                    )}
                </Box>

                {message.reactions?.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                        {message.reactions.map((r) => (
                            <Box key={r.emoji} role="button" tabIndex={0}
                                 onClick={() => onReact?.(message, r.mine ? null : r.emoji)}
                                 title={r.mine ? t('Прибрати реакцію') : t('Поставити таку ж')}
                                 sx={(t) => ({
                                     display: 'flex', alignItems: 'center', gap: 0.4, px: 0.8, py: 0.15,
                                     borderRadius: radius.pill, cursor: onReact ? 'pointer' : 'default',
                                     fontSize: 12.5, lineHeight: 1.5,
                                     bgcolor: r.mine ? t.c.accentSoft : t.c.surface,
                                     border: `1px solid ${r.mine ? t.c.accent : t.c.border}`,
                                     transition: 'transform .1s', '&:hover': { transform: 'scale(1.06)' },
                                 })}>
                                <span>{r.emoji}</span>
                                {r.count > 1 && (
                                    <Typography component="span" sx={(t) => ({ ...numeric, fontSize: 11, fontWeight: 700, color: r.mine ? t.c.accentText : t.c.textMuted })}>
                                        {r.count}
                                    </Typography>
                                )}
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {!isUser && <Actions onReply={() => onReply?.(message)} onMore={onMenu ? (e) => onMenu(e, message) : null} />}
        </Box>
    );
}

/**
 * Telegram's own preview of a link — title, site and picture come with the message, so
 * showing them sends nothing to the linked site.
 */
function LinkPreview({ preview, message, onFill }) {
    const image = message.mediaType === 'webpage' && message.mediaBase64
        ? `data:${message.mediaMime || 'image/jpeg'};base64,${message.mediaBase64}` : null;
    if (!preview.title && !preview.description && !image) return null;
    return (
        <Box component="a" href={preview.url} target="_blank" rel="noreferrer noopener"
             sx={(t) => ({
                 display: 'block', mt: 0.75, pl: 1.1, pr: 1, py: 0.75, textDecoration: 'none', maxWidth: 360,
                 borderLeft: `3px solid ${onFill ? t.c.onAccent : t.c.accent}`,
                 bgcolor: onFill ? alpha(t.c.onAccent, 0.12) : t.c.surfaceSunken,
                 borderRadius: `0 ${radius.md} ${radius.md} 0`,
                 '&:hover': { bgcolor: onFill ? alpha(t.c.onAccent, 0.18) : t.c.surfaceHover },
             })}>
            {preview.site && (
                <Typography sx={(t) => ({ fontSize: 11.5, fontWeight: 700, color: onFill ? t.c.onAccent : t.c.accentText })}>
                    {preview.site}
                </Typography>
            )}
            {preview.title && (
                <Typography sx={(t) => ({ fontSize: 12.5, fontWeight: 650, color: onFill ? t.c.onAccent : t.c.text, lineHeight: 1.35 })}>
                    {preview.title}
                </Typography>
            )}
            {preview.description && (
                <Typography sx={(t) => ({
                    fontSize: 12, color: onFill ? alpha(t.c.onAccent, 0.85) : t.c.textMuted, lineHeight: 1.4, mt: 0.25,
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                })}>
                    {plainText(preview.description)}
                </Typography>
            )}
            {image && (
                <img src={image} alt="" style={{ marginTop: 6, width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
            )}
        </Box>
    );
}

function Actions({ onReply, onDelete, onMore }) {
    return (
        <Box className="msg-actions" sx={{
            display: 'flex', gap: 0.25, flexShrink: 0, mb: 0.25,
            opacity: 0, pointerEvents: 'none',
            transition: 'opacity .12s',
        }}>
            <Tooltip title={t('Відповісти')}>
                <IconButton size="small" onClick={onReply} sx={{ width: 26, height: 26 }}>
                    <ReplyIcon sx={{ fontSize: 15 }} />
                </IconButton>
            </Tooltip>
            {onMore && (
                <Tooltip title={t('Ще (або правий клік)')}>
                    <IconButton size="small" onClick={onMore} sx={{ width: 26, height: 26 }}>
                        <MoreHorizIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                </Tooltip>
            )}
            {onDelete && (
                <Tooltip title={t('Видалити')}>
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
