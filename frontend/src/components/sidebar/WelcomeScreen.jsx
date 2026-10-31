import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import AddIcon from '@mui/icons-material/Add';
import MessengerGlyph from './MessengerGlyph';
import archiveService from '../../services/archiveService';
import assistService from '../../services/assistService';
import systemService from '../../services/systemService';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { plainText } from '../../utils/richText';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius, numeric, type } from '../../theme/tokens';
import { formatListTime } from '../../utils/format';
import { usePresentation } from '../../context/PresentationContext';
import { t, LOCALE } from '../../i18n';

/**
 * The reading area when no chat is open: chats waiting for a reply, unread by network, archive size
 * and onboarding for a new user.
 */
export default function WelcomeScreen({ networks = [], totalUnread = 0, onPickNetwork, onAddAccount, onOpenContacts,
                                        onOpenChat, onOpenPalette }) {
    const [stats, setStats] = useState(null);
    const [waiting, setWaiting] = useState([]);
    const { name } = usePresentation();
    const [modelsReady, setModelsReady] = useState(null);

    // Conversations where the last word is someone else's, across every network.
    useEffect(() => {
        let cancelled = false;
        assistService.unanswered()
            .then(data => { if (!cancelled) setWaiting(data || []); })
            .catch(() => { /* optional */ });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        archiveService.getStats()
            .then(res => { if (!cancelled) setStats(res.data); })
            .catch(() => { /* the screen is still useful without it */ });
        return () => { cancelled = true; };
    }, []);

    const connected = networks.filter(n => n.connected);
    const withUnread = connected.filter(n => n.unread > 0);
    const isNew = connected.length === 0;

    // Only a brand-new user sees the checklist, so only then is the model host asked about.
    useEffect(() => {
        if (!isNew) return undefined;
        let cancelled = false;
        systemService.getStatus()
            .then(st => { if (!cancelled) setModelsReady(Boolean(st?.ai?.reachable && st.ai.models?.length)); })
            .catch(() => { if (!cancelled) setModelsReady(false); });
        return () => { cancelled = true; };
    }, [isNew]);

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
                    {totalUnread > 0 ? t('{0} непрочитаних', totalUnread) : t('Усе прочитано')}
                </Typography>
                <Typography sx={(t) => ({ fontSize: 13.5, color: t.c.textMuted, mt: 0.5 })}>
                    {connected.length === 0
                        ? t('Підключіть месенджер, щоб зібрати всі чати в одному списку')
                        : withUnread.length > 0
                            ? t('Оберіть мережу нижче або чат ліворуч')
                            : t('Оберіть чат ліворуч, щоб продовжити розмову')}
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
                                        {network.chats} {network.chats === 1 ? t('чат') : t('чатів')}
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

                {isNew && (
                    <Box sx={(t) => ({ mt: 3, p: 2, borderRadius: radius.lg, bgcolor: t.c.surface, border: `1px solid ${t.c.border}` })}>
                        <Typography sx={(t) => ({ ...type.micro, color: t.c.textFaint, mb: 1.5 })}>{t('З чого почати')}</Typography>
                        {[
                            [false, t('Підключіть перший месенджер'), t('Telegram — за QR-кодом, WhatsApp — так само, Slack — токеном'), onAddAccount],
                            [modelsReady, t('Локальна модель'), modelsReady == null ? t('перевіряємо Ollama…') : modelsReady ? t('Ollama працює — аналіз і пошук за змістом доступні') : t('Запустіть Ollama і завантажте qwen2.5:7b та bge-m3'), null],
                            [false, t('Спробуйте пошук за змістом'), t('Опишіть, що шукаєте, своїми словами — наприклад, «де домовлялись про зустріч»'), null],
                        ].map(([done, title, hint, action], i) => (
                            <Box key={title} onClick={action || undefined} role={action ? 'button' : undefined}
                                 sx={(t) => ({ display: 'flex', gap: 1.25, py: 1, cursor: action ? 'pointer' : 'default', borderTop: i ? `1px solid ${t.c.border}` : 'none' })}>
                                {done
                                    ? <CheckCircleRoundedIcon sx={(t) => ({ fontSize: 20, color: t.c.success })} />
                                    : <RadioButtonUncheckedIcon sx={(t) => ({ fontSize: 20, color: t.c.borderStrong })} />}
                                <Box>
                                    <Typography sx={(t) => ({ fontSize: 13, fontWeight: 650, color: t.c.text })}>{i + 1}. {title}</Typography>
                                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint })}>{hint}</Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}

                {waiting.length > 0 && (
                    <Box sx={(t) => ({ mt: 3, borderRadius: radius.lg, bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, overflow: 'hidden' })}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, px: 2, pt: 1.75, pb: 1 }}>
                            <Typography sx={(t) => ({ ...type.micro, color: t.c.textFaint })}>{t('Чекають на вашу відповідь')}</Typography>
                            <Typography sx={(t) => ({ ...numeric, fontSize: 11, color: t.c.textFaint })}>{waiting.length}</Typography>
                        </Box>
                        {waiting.map(item => (
                            <Box key={item.chatId} role="button" tabIndex={0}
                                 onClick={() => onOpenChat?.(item.chatId)}
                                 onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenChat?.(item.chatId)}
                                 sx={(t) => ({
                                     display: 'flex', alignItems: 'flex-start', gap: 1.25, px: 2, py: 1.1, cursor: 'pointer',
                                     borderTop: `1px solid ${t.c.border}`, transition: 'background-color .12s',
                                     '&:hover': { bgcolor: t.c.surfaceHover },
                                 })}>
                                <Box sx={{ pt: '3px' }}><MessengerGlyph type={item.messengerType} size={13} /></Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <Typography noWrap sx={(t) => ({ fontSize: 13, fontWeight: 650, color: t.c.text, flex: 1, minWidth: 0 })}>
                                            {name(item.chatName)}
                                        </Typography>
                                        {item.question && (
                                            <HelpOutlineIcon titleAccess={t('Питання')} sx={(t) => ({ fontSize: 14, color: t.c.accentText })} />
                                        )}
                                        <Typography sx={(t) => ({ ...numeric, fontSize: 11, color: t.c.textFaint, flexShrink: 0 })}>
                                            {formatListTime(item.timestamp)}
                                        </Typography>
                                    </Box>
                                    <Typography data-private sx={(t) => ({
                                        fontSize: 12.5, color: t.c.textMuted, lineHeight: 1.45,
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                    })}>
                                        {plainText(item.text)}
                                    </Typography>
                                </Box>
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
                            {t('Локальний архів')}
                        </Typography>
                        {/* Even columns rather than a flex run: three figures pushed against
                            the left edge of a 620px card read as an accident. */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                            <Box>
                                <Typography sx={(t) => ({ ...numeric, fontSize: 20, fontWeight: 800, color: t.c.text, lineHeight: 1.1 })}>
                                    {stats.totalMessages.toLocaleString(LOCALE)}
                                </Typography>
                                <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                                    {t('повідомлень')}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography sx={(t) => ({ ...numeric, fontSize: 20, fontWeight: 800, color: t.c.text, lineHeight: 1.1 })}>
                                    {stats.chatsWithMessages}
                                </Typography>
                                <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                                    {t('чатів')}
                                </Typography>
                            </Box>
                            {stats.oldestMessageAt && (
                                <Box>
                                    <Typography sx={(t) => ({ ...numeric, fontSize: 20, fontWeight: 800, color: t.c.text, lineHeight: 1.1 })}>
                                        {formatListTime(stats.oldestMessageAt)}
                                    </Typography>
                                    <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                                        {t('найдавніше')}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
                    <Action icon={<AddIcon sx={{ fontSize: 15 }} />} label={t('Підключити месенджер')} onClick={onAddAccount} primary />
                    <Action icon={<PeopleAltOutlinedIcon sx={{ fontSize: 15 }} />} label={t('Контакти між мережами')} onClick={onOpenContacts} />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4 }}>
                    <ForumOutlinedIcon sx={(t) => ({ fontSize: 14, color: t.c.textFaint })} />
                    <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>
                        <Key>/</Key>{t(' — пошук по чатах та історії · ')}<Box component="span" role="button" onClick={onOpenPalette} sx={{ cursor: 'pointer' }}><Key>Ctrl</Key>+<Key>K</Key>{t(' — будь-яка дія')}</Box>
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
