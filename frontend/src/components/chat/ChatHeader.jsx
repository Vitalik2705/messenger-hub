import { Box, Avatar, Typography, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import InsightsIcon from '@mui/icons-material/Insights';
import AutoReplyMenu from './AutoReplyMenu';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius } from '../../theme/tokens';
import { avatarTint, initialsOf } from '../../utils/format';
import { usePresentation } from '../../context/PresentationContext';
import { t } from '../../i18n';

/**
 * The bar above a conversation: who it is, which network, presence where it is actually known
 * (Telegram person chats), and the chat's actions.
 */
export default function ChatHeader({ chat, userStatus, onClose,
                                     contactName, linkedIdentities = [], accountLabels = {},
                                     onOpenLinked, onAnalyse, onOpenProfile, typing, onSearch }) {
    const narrow = useMediaQuery('(max-width: 760px)');
    const { presenting, name } = usePresentation();
    const networkColor = MESSENGER_COLORS[chat.messengerType] || '#8A8F98';

    const presenceKnown = chat.messengerType === 'TELEGRAM' && chat.chatType === 'PERSONAL';
    const isOnline = presenceKnown && userStatus?.status === 'online';

    const subtitle = typing ? t('друкує…') : presenceKnown
        ? (isOnline ? t('Онлайн') : userStatus?.last_seen || t('Був(ла) нещодавно'))
        : chat.chatType === 'PERSONAL'
            ? MESSENGER_LABELS[chat.messengerType]
            : t('Груповий чат');

    return (
        <Box sx={(t) => ({
            px: 2.5, py: 1.5,
            display: 'flex', alignItems: 'center', gap: 1.25,
            bgcolor: t.c.surfaceAlt,
            borderBottom: `1px solid ${t.c.border}`,
            flexShrink: 0,
        })}>
            {narrow && (
                <IconButton size="small" onClick={onClose} sx={{ width: 32, height: 32, flexShrink: 0, ml: -1 }} title={t('До списку чатів')}>
                    <ArrowBackIcon sx={{ fontSize: 20 }} />
                </IconButton>
            )}

            {/* Avatar and name are one target: clicking who you are talking to opens who
                they are, the way every messenger does it. */}
            <Box
                onClick={onOpenProfile}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenProfile?.()}
                title={t('Профіль')}
                sx={(t) => ({
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25,
                    cursor: 'pointer', borderRadius: radius.md, mx: -0.75, px: 0.75, py: 0.25,
                    transition: 'background-color .12s',
                    '&:hover': { bgcolor: t.c.surfaceHover },
                })}
            >
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
                    {chat.avatarBase64 && !presenting
                        ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt=""
                               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initialsOf(name(chat.name, chat.chatKind))}
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
                        {name(chat.name, chat.chatKind)}
                    </Typography>
                    <Tooltip title={MESSENGER_LABELS[chat.messengerType] || chat.messengerType}>
                        <Box sx={{ display: 'flex', flexShrink: 0, mt: '1px' }}>
                            <MessengerGlyph type={chat.messengerType} size={12} />
                        </Box>
                    </Tooltip>
                </Box>
                <Typography noWrap sx={(t) => ({
                    fontSize: 11.5,
                    color: typing ? t.c.accentText : isOnline ? t.c.success : t.c.textFaint,
                    fontWeight: typing || isOnline ? 650 : 450,
                })}>
                    {subtitle}
                </Typography>
            </Box>
            </Box>

            {/* The same person's chats in other networks, one click away. */}
            {linkedIdentities.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, mr: 0.5 }}>
                    <Tooltip title={contactName ? t('Та сама людина: {0}', name(contactName)) : t('Та сама людина')}>
                        <LinkIcon sx={(t) => ({ fontSize: 15, color: t.c.textFaint })} />
                    </Tooltip>
                    {linkedIdentities.map(identity => (
                        <Tooltip
                            key={identity.id}
                            title={[
                                t('Відкрити {0}: {1}', MESSENGER_LABELS[identity.messengerType] || '', name(identity.displayName)),
                                // Named only where the network has more than one account.
                                accountLabels[identity.messengerAccountId]
                                    && t('через {0}', accountLabels[identity.messengerAccountId]),
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
                                    {name(identity.displayName)}
                                </Typography>
                            </Box>
                        </Tooltip>
                    ))}
                </Box>
            )}

            {onSearch && (
                <Tooltip title={t('Пошук у чаті — Ctrl+F')}>
                    <IconButton size="small" onClick={onSearch} sx={{ width: 32, height: 32, flexShrink: 0 }}>
                        <SearchIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
            )}

            <AutoReplyMenu chatId={chat.id} />

            <Tooltip title={t('Аналітика чату')}>
                <IconButton size="small" onClick={onAnalyse}
                            sx={{ width: 32, height: 32, flexShrink: 0 }}>
                    <InsightsIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>

            {!narrow && (
                <Tooltip title={t('Закрити чат')}>
                    <IconButton size="small" onClick={onClose} sx={{ width: 32, height: 32, flexShrink: 0 }}>
                        <CloseIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
}
