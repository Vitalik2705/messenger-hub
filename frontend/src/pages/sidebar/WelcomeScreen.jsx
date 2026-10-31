import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import AddIcon from '@mui/icons-material/Add';
import MessengerGlyph from './MessengerGlyph';
import archiveService from '../../services/archiveService';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius, numeric, type } from '../../theme/tokens';
import { formatListTime } from '../../utils/format';

/**
 * What fills the reading area when no conversation is open.
 *
 * The previous version was a poster: an emoji in a gradient tile, a serif headline and three
 * decorative rings, spread across the entire viewport to say "pick a chat" — which the user
 * was about to do anyway. This does work instead: where the unread messages are, how much
 * history has been collected, and what can be done from here.
 */
export default function WelcomeScreen({ networks = [], totalUnread = 0, onPickNetwork, onAddAccount, onOpenContacts }) {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        let cancelled = false;
        archiveService.getStats()
            .then(res => { if (!cancelled) setStats(res.data); })
            .catch(() => { /* the screen is still useful without it */ });
        return () => { cancelled = true; };
    }, []);

    const connected = networks.filter(n => n.connected);
    const withUnread = connected.filter(n => n.unread > 0);

    return (
        <Box sx={(t) => ({
            flexGrow: 1, minWidth: 0,
            bgcolor: t.c.bg,
            overflowY: 'auto',
            display: 'flex', justifyContent: 'center',
        })}>
            {/* Capped, and centred on both axes via auto margins rather than `alignItems`,
                which would clip the top once the content outgrows the pane. */}
            <Box sx={{ width: '100%', maxWidth: 620, px: 4, py: 6, my: 'auto' }}>

                <Typography sx={(t) => ({ ...type.display, fontSize: 26, color: t.c.text })}>
                    {totalUnread > 0 ? `${totalUnread} непрочитаних` : 'Усе прочитано'}
                </Typography>
                <Typography sx={(t) => ({ fontSize: 13.5, color: t.c.textMuted, mt: 0.5 })}>
                    {connected.length === 0
                        ? 'Підключіть месенджер, щоб зібрати всі чати в одному списку'
                        : withUnread.length > 0
                            ? 'Оберіть мережу нижче або чат ліворуч'
                            : 'Оберіть чат ліворуч, щоб продовжити розмову'}
                </Typography>

                {withUnread.length > 0 && (
                    /* auto-fit, not auto-fill: with one network connected, auto-fill keeps
                       two empty tracks and leaves the single card stranded at a third of
                       the width. */
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, mt: 3 }}>
                        {withUnread.map(network => (
                            <Box
                                key={network.type}
                                onClick={() => onPickNetwork?.(network.type)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPickNetwork?.(network.type)}
                                sx={(t) => ({
                                    display: 'flex', alignItems: 'center', gap: 1.25,
                                    p: 1.5, borderRadius: radius.lg,
                                    bgcolor: t.c.surface,
                                    border: `1px solid ${t.c.border}`,
                                    cursor: 'pointer',
                                    transition: 'all .12s',
                                    '&:hover': { borderColor: MESSENGER_COLORS[network.type], transform: 'translateY(-1px)' },
                                })}
                            >
                                <MessengerGlyph type={network.type} size={15} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography sx={(t) => ({ fontSize: 12.5, fontWeight: 650, color: t.c.text })}>
                                        {MESSENGER_LABELS[network.type]}
                                    </Typography>
                                    <Typography sx={(t) => ({ ...numeric, fontSize: 11, color: t.c.textFaint })}>
                                        {network.chats} {network.chats === 1 ? 'чат' : 'чатів'}
                                    </Typography>
                                </Box>
                                <Typography sx={(t) => ({
                                    ...numeric, fontSize: 15, fontWeight: 800, color: t.c.accentText,
                                })}>
                                    {network.unread > 99 ? '99+' : network.unread}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* The archive is what search and contact matching are built on, so its size
                    is worth stating rather than leaving as something that happens silently. */}
                {stats && stats.totalMessages > 0 && (
                    <Box sx={(t) => ({
                        mt: 3, p: 2, borderRadius: radius.lg,
                        bgcolor: t.c.surface, border: `1px solid ${t.c.border}`,
                    })}>
                        <Typography sx={(t) => ({ ...type.micro, color: t.c.textFaint, mb: 1.25 })}>
                            Локальний архів
                        </Typography>
                        {/* Even columns rather than a flex run: three figures pushed against
                            the left edge of a 620px card read as an accident. */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                            <Box>
                                <Typography sx={(t) => ({ ...numeric, fontSize: 20, fontWeight: 800, color: t.c.text, lineHeight: 1.1 })}>
                                    {stats.totalMessages.toLocaleString('uk-UA')}
                                </Typography>
                                <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                                    повідомлень
                                </Typography>
                            </Box>
                            <Box>
                                <Typography sx={(t) => ({ ...numeric, fontSize: 20, fontWeight: 800, color: t.c.text, lineHeight: 1.1 })}>
                                    {stats.chatsWithMessages}
                                </Typography>
                                <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                                    чатів
                                </Typography>
                            </Box>
                            {stats.oldestMessageAt && (
                                <Box>
                                    <Typography sx={(t) => ({ ...numeric, fontSize: 20, fontWeight: 800, color: t.c.text, lineHeight: 1.1 })}>
                                        {formatListTime(stats.oldestMessageAt)}
                                    </Typography>
                                    <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                                        найдавніше
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
                    <Action icon={<AddIcon sx={{ fontSize: 15 }} />} label="Підключити месенджер" onClick={onAddAccount} primary />
                    <Action icon={<PeopleAltOutlinedIcon sx={{ fontSize: 15 }} />} label="Контакти між мережами" onClick={onOpenContacts} />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4 }}>
                    <ForumOutlinedIcon sx={(t) => ({ fontSize: 14, color: t.c.textFaint })} />
                    <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                        Натисніть <Key>/</Key> для пошуку по чатах та історії
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}

function Key({ children }) {
    return (
        <Box component="kbd" sx={(t) => ({
            ...numeric,
            fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
            border: `1px solid ${t.c.border}`, borderRadius: radius.sm,
            px: 0.5, mx: 0.25, color: t.c.textMuted, bgcolor: t.c.surface,
        })}>
            {children}
        </Box>
    );
}

function Action({ icon, label, onClick, primary }) {
    return (
        <Box
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
            sx={(t) => ({
                display: 'inline-flex', alignItems: 'center', gap: 0.75,
                px: 1.5, py: 0.85, borderRadius: radius.md,
                fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
                bgcolor: primary ? t.c.accent : t.c.surface,
                color: primary ? t.c.onAccent : t.c.textMuted,
                border: `1px solid ${primary ? 'transparent' : t.c.border}`,
                transition: 'all .12s',
                '&:hover': primary
                    ? { bgcolor: t.c.accentHover }
                    : { bgcolor: t.c.surfaceHover, color: t.c.text },
            })}
        >
            {icon}
            {label}
        </Box>
    );
}
