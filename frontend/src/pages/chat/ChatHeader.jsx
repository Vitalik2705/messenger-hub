import { Box, Avatar, Typography, IconButton, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import InsightsIcon from '@mui/icons-material/Insights';
import AutoReplyMenu from './AutoReplyMenu';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius } from '../../theme/tokens';
import { avatarTint, initialsOf } from '../../utils/format';

/**
 * The bar above a conversation: who it is, where it lives, and how to leave.
 *
 * Presence is only claimed where it is actually known. The previous version showed a
 * pulsing green dot and the word "Онлайн" for every group and every non-Telegram chat,
 * because `isLive` was true whenever presence could not be determined — a status indicator
 * that is always green tells the reader nothing.
 */
export default function ChatHeader({ chat, userStatus, onClose,
                                     contactName, linkedIdentities = [], accountLabels = {},
                                     onOpenLinked, onAnalyse }) {
    const networkColor = MESSENGER_COLORS[chat.messengerType] || '#8A8F98';

    const presenceKnown = chat.messengerType === 'TELEGRAM' && chat.chatType === 'PERSONAL';
    const isOnline = presenceKnown && userStatus?.status === 'online';

    const subtitle = presenceKnown
        ? (isOnline ? 'Онлайн' : userStatus?.last_seen || 'Був(ла) нещодавно')
        : chat.chatType === 'PERSONAL'
            ? MESSENGER_LABELS[chat.messengerType]
            : 'Груповий чат';

    return (
        <Box sx={(t) => ({
            px: 2.5, py: 1.5,
            display: 'flex', alignItems: 'center', gap: 1.25,
            bgcolor: t.c.surfaceAlt,
            borderBottom: `1px solid ${t.c.border}`,
            flexShrink: 0,
        })}>
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
                <Avatar
                    variant="rounded"
                    sx={(t) => ({
                        width: 36, height: 36,
                        borderRadius: `${radius.lg}`,
                        bgcolor: avatarTint(chat.messengerType),
                        color: networkColor,
                        fontSize: 12, fontWeight: 750,
                        border: `1px solid ${t.c.border}`,
                    })}
                >
                    {chat.avatarBase64
                        ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt=""
                               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initialsOf(chat.name)}
                </Avatar>
                {isOnline && (
                    <Box sx={(t) => ({
                        position: 'absolute', bottom: -1, right: -1,
                        width: 10, height: 10, borderRadius: '50%',
                        bgcolor: t.c.success,
                        border: `2px solid ${t.c.surfaceAlt}`,
                    })} />
                )}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                    <Typography noWrap sx={(t) => ({ fontSize: 14, fontWeight: 700, color: t.c.text })}>
                        {chat.name}
                    </Typography>
                    <Tooltip title={MESSENGER_LABELS[chat.messengerType] || chat.messengerType}>
                        <Box sx={{ display: 'flex', flexShrink: 0, mt: '1px' }}>
                            <MessengerGlyph type={chat.messengerType} size={12} />
                        </Box>
                    </Tooltip>
                </Box>
                <Typography noWrap sx={(t) => ({
                    fontSize: 11.5,
                    color: isOnline ? t.c.success : t.c.textFaint,
                    fontWeight: isOnline ? 650 : 450,
                })}>
                    {subtitle}
                </Typography>
            </Box>

            {/* What linking a contact is for.
                A confirmed link used to exist only as a row inside the contacts dialog; here
                it is on the conversation it describes, and it switches to the person's other
                chat in one click instead of a hunt through the list. */}
            {linkedIdentities.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, mr: 0.5 }}>
                    <Tooltip title={contactName ? `Та сама людина: ${contactName}` : 'Та сама людина'}>
                        <LinkIcon sx={(t) => ({ fontSize: 15, color: t.c.textFaint })} />
                    </Tooltip>
                    {linkedIdentities.map(identity => (
                        <Tooltip
                            key={identity.id}
                            title={[
                                `Відкрити ${MESSENGER_LABELS[identity.messengerType] || ''}: ${identity.displayName}`,
                                // Named only where the network has more than one account.
                                accountLabels[identity.messengerAccountId]
                                    && `через ${accountLabels[identity.messengerAccountId]}`,
                            ].filter(Boolean).join(' · ')}
                        >
                            <Box
                                onClick={() => onOpenLinked?.(identity.chatId)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenLinked?.(identity.chatId)}
                                sx={(t) => ({
                                    display: 'flex', alignItems: 'center', gap: 0.6,
                                    maxWidth: 170,
                                    px: 1, py: 0.5,
                                    borderRadius: `${radius.pill}`,
                                    bgcolor: t.c.surfaceSunken,
                                    border: `1px solid ${t.c.border}`,
                                    cursor: 'pointer',
                                    transition: 'border-color .12s, background-color .12s',
                                    '&:hover': { borderColor: t.c.accent, bgcolor: t.c.accentSoft },
                                })}
                            >
                                <MessengerGlyph type={identity.messengerType} size={12} />
                                <Typography noWrap sx={(t) => ({
                                    fontSize: 11.5, fontWeight: 600, color: t.c.textMuted,
                                })}>
                                    {identity.displayName}
                                </Typography>
                            </Box>
                        </Tooltip>
                    ))}
                </Box>
            )}

            <AutoReplyMenu chatId={chat.id} />

            <Tooltip title="Аналітика чату">
                <IconButton size="small" onClick={onAnalyse}
                            sx={{ width: 32, height: 32, flexShrink: 0 }}>
                    <InsightsIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>

            <Tooltip title="Закрити чат">
                <IconButton size="small" onClick={onClose} sx={{ width: 32, height: 32, flexShrink: 0 }}>
                    <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
