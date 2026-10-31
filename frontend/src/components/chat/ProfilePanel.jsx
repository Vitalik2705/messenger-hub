import { useState, useEffect } from 'react';
import { Drawer, Box, Typography, IconButton, Avatar, CircularProgress, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import InsightsIcon from '@mui/icons-material/Insights';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VerifiedIcon from '@mui/icons-material/Verified';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LinkIcon from '@mui/icons-material/Link';
import telegramService from '../../services/telegramService';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius } from '../../theme/tokens';
import { avatarTint, initialsOf } from '../../utils/format';
import { usePresentation } from '../../context/PresentationContext';
import { t, plural, LOCALE } from '../../i18n';

const KIND_LABELS = { PERSON: t('Особистий чат'), BOT: t('Бот'), GROUP: t('Група'), CHANNEL: t('Канал') };

function InfoRow({ icon, value, caption, copy }) {
    const [copied, setCopied] = useState(false);
    if (!value) return null;
    return (
        <Box sx={(t) => ({
            display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.1,
            '&:hover': { bgcolor: t.c.surfaceHover }, '&:hover .copy': { opacity: 1 },
        })}>
            <Box sx={(t) => ({ color: t.c.textFaint, display: 'flex', pt: '2px' })}>{icon}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={(t) => ({ fontSize: 13.5, color: t.c.text, wordBreak: 'break-word', whiteSpace: 'pre-wrap' })}>
                    {value}
                </Typography>
                <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint })}>{caption}</Typography>
            </Box>
            {copy && (
                <Tooltip title={copied ? t('Скопійовано') : t('Копіювати')}>
                    <IconButton
                        className="copy" size="small"
                        onClick={() => { navigator.clipboard?.writeText(copy); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
                        sx={{ opacity: 0, width: 28, height: 28, transition: 'opacity .12s' }}
                    >
                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
}

function ActionButton({ icon, label, onClick, href, primary }) {
    return (
        <Box
            component={href ? 'a' : 'div'}
            href={href}
            target={href ? '_blank' : undefined}
            rel={href ? 'noreferrer' : undefined}
            onClick={onClick}
            role="button"
            sx={(t) => ({
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                py: 1.1, borderRadius: radius.md, cursor: 'pointer', textDecoration: 'none',
                bgcolor: primary ? t.c.accent : t.c.surfaceSunken,
                color: primary ? t.c.onAccent : t.c.textMuted,
                transition: 'background-color .12s, transform .12s',
                '&:hover': { bgcolor: primary ? t.c.accentHover : t.c.surfaceActive, transform: 'translateY(-1px)' },
            })}
        >
            {icon}
            <Typography sx={{ fontSize: 11.5, fontWeight: 650, color: 'inherit' }}>{label}</Typography>
        </Box>
    );
}

/**
 * The profile drawer opened from the chat header. For Telegram: photo, @username, bio, phone,
 * member count and a link to the app. Below: the photos of this conversation.
 */
export default function ProfilePanel({ open, onClose, chat, photos = [], onOpenPhoto, onAnalyse,
                                       linkedIdentities = [], onOpenLinked, userStatus }) {
    const isTelegram = chat?.messengerType === 'TELEGRAM';
    // Which profile is wanted right now; a result for any other key is stale.
    const key = open && isTelegram && chat?.externalChatId
        ? `${chat.messengerAccountId ?? ''}:${chat.externalChatId}` : null;
    const [result, setResult] = useState({ key: null });

    useEffect(() => {
        if (!key) return undefined;
        let cancelled = false;
        telegramService.getProfile(chat.externalChatId, chat.messengerAccountId)
            .then((data) => { if (!cancelled) setResult({ key, data }); })
            .catch(() => { if (!cancelled) setResult({ key, error: t('Telegram не віддав профіль') }); });
        return () => { cancelled = true; };
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the key encodes both ids

    const current = result.key === key ? result : {};
    const profile = current.data || null;
    const error = current.error || '';
    const loading = Boolean(key) && result.key !== key;

    const { presenting, name: alias } = usePresentation();

    if (!chat) return null;

    const networkColor = MESSENGER_COLORS[chat.messengerType] || '#8A8F98';
    const name = alias(profile?.name || chat.name, chat.chatKind);
    const photo = presenting ? null : profile?.photo_base64 || chat.avatarBase64;
    const kind = profile?.kind || chat.chatKind || (chat.chatType === 'PERSONAL' ? 'PERSON' : 'GROUP');
    const presence = profile?.presence || userStatus;

    const subtitle = presence?.status === 'online' ? t('онлайн')
        : presence?.last_seen
            || (profile?.members != null
                ? `${profile.members.toLocaleString(LOCALE)} ${plural(profile.members, t('учасник'), t('учасники'), t('учасників'))}`
                : KIND_LABELS[kind] || MESSENGER_LABELS[chat.messengerType]);

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            slotProps={{
                paper: {
                    sx: (t) => ({
                        width: 360, maxWidth: '100vw', bgcolor: t.c.surfaceAlt, backgroundImage: 'none',
                        borderLeft: `1px solid ${t.c.border}`, boxShadow: t.c.shadowRaised,
                    }),
                },
                backdrop: { sx: (t) => ({ bgcolor: t.c.scrim }) },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5 }}>
                <Typography sx={(t) => ({ flex: 1, fontSize: 14, fontWeight: 700, color: t.c.text })}>
                    {kind === 'GROUP' ? t('Про групу') : kind === 'CHANNEL' ? t('Про канал') : t('Профіль')}
                </Typography>
                <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
            </Box>

            <Box sx={{ overflowY: 'auto', flex: 1, pb: 3 }}>
                {/* Identity */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: 2, pt: 1, pb: 2.5 }}>
                    <Box sx={{ position: 'relative' }}>
                        <Avatar
                            sx={(t) => ({
                                width: 112, height: 112, fontSize: 36, fontWeight: 750,
                                bgcolor: avatarTint(chat.messengerType), color: networkColor,
                                border: `3px solid ${t.c.surface}`, boxShadow: t.c.shadowRaised,
                            })}
                        >
                            {photo
                                ? <img src={`data:image/jpeg;base64,${photo}`} alt=""
                                       style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : initialsOf(name)}
                        </Avatar>
                        <Box sx={(t) => ({
                            position: 'absolute', right: 2, bottom: 2, width: 26, height: 26, borderRadius: '50%',
                            bgcolor: t.c.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: t.c.shadow,
                        })}>
                            <MessengerGlyph type={chat.messengerType} size={14} />
                        </Box>
                        {loading && (
                            <CircularProgress size={120} thickness={1.5}
                                              sx={{ position: 'absolute', top: -4, left: -4, color: networkColor }} />
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.75, maxWidth: '100%' }}>
                        <Typography sx={(t) => ({ fontSize: 18, fontWeight: 800, color: t.c.text, textAlign: 'center', letterSpacing: '-0.02em' })}>
                            {name}
                        </Typography>
                        {profile?.verified && <VerifiedIcon sx={{ fontSize: 18, color: networkColor }} />}
                    </Box>
                    <Typography sx={(t) => ({
                        fontSize: 12.5, mt: 0.25,
                        color: presence?.status === 'online' ? t.c.success : t.c.textFaint,
                        fontWeight: presence?.status === 'online' ? 650 : 450,
                    })}>
                        {subtitle}
                    </Typography>
                </Box>

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 1, px: 2, mb: 2 }}>
                    {profile?.link && (
                        <ActionButton primary icon={<OpenInNewIcon sx={{ fontSize: 18 }} />}
                                      label={t('Відкрити в Telegram')} href={profile.link} />
                    )}
                    <ActionButton icon={<InsightsIcon sx={{ fontSize: 18 }} />} label={t('Аналітика')}
                                  onClick={() => { onClose(); onAnalyse?.(); }} />
                </Box>

                {error && (
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint, px: 2, mb: 1 })}>{error}</Typography>
                )}

                {/* Details */}
                {(profile?.username || profile?.phone || profile?.bio || profile?.common_chats) && (
                    <Box data-private sx={(t) => ({ mx: 2, mb: 2, py: 0.5, bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: radius.lg, overflow: 'hidden' })}>
                        <InfoRow icon={<AlternateEmailIcon sx={{ fontSize: 18 }} />}
                                 value={profile?.username && `@${profile.username}`}
                                 caption={t('Імʼя користувача')} copy={profile?.username && `@${profile.username}`} />
                        <InfoRow icon={<PhoneOutlinedIcon sx={{ fontSize: 18 }} />}
                                 value={profile?.phone} caption={t('Телефон')} copy={profile?.phone} />
                        <InfoRow icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}
                                 value={profile?.bio} caption={kind === 'PERSON' || kind === 'BOT' ? t('Про себе') : t('Опис')} />
                        <InfoRow icon={<GroupsOutlinedIcon sx={{ fontSize: 18 }} />}
                                 value={profile?.common_chats ? `${profile.common_chats} ${plural(profile.common_chats, t('спільна група'), t('спільні групи'), t('спільних груп'))}` : null}
                                 caption={t('Спільні чати')} />
                    </Box>
                )}

                {/* The same person elsewhere */}
                {linkedIdentities.length > 0 && (
                    <Box sx={{ px: 2, mb: 2 }}>
                        <Typography sx={(t) => ({ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.c.textFaint, mb: 1 })}>
                            {t('Та сама людина в інших мережах')}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {linkedIdentities.map(identity => (
                                <Box key={identity.id} role="button" tabIndex={0}
                                     onClick={() => { onClose(); onOpenLinked?.(identity.chatId); }}
                                     sx={(t) => ({
                                         display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.6,
                                         borderRadius: radius.pill, cursor: 'pointer',
                                         bgcolor: t.c.surface, border: `1px solid ${t.c.border}`,
                                         '&:hover': { borderColor: t.c.accent },
                                     })}>
                                    <LinkIcon sx={(t) => ({ fontSize: 14, color: t.c.textFaint })} />
                                    <MessengerGlyph type={identity.messengerType} size={12} />
                                    <Typography sx={(t) => ({ fontSize: 12, fontWeight: 600, color: t.c.textMuted })}>
                                        {alias(identity.displayName)}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}

                {/* Media */}
                <Box sx={{ px: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                        <Typography sx={(t) => ({ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.c.textFaint })}>
                            {t('Фото з чату')}
                        </Typography>
                        <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint })}>{photos.length || ''}</Typography>
                    </Box>
                    {photos.length === 0 ? (
                        <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint })}>
                            {t('Серед завантажених повідомлень фото немає. Прогорніть чат вище, щоб підвантажити старіші.')}
                        </Typography>
                    ) : (
                        <Box data-private sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', borderRadius: radius.md, overflow: 'hidden' }}>
                            {photos.slice().reverse().map((item) => (
                                <Box key={item.key} onClick={() => onOpenPhoto?.(item.key)}
                                     sx={{
                                         aspectRatio: '1', cursor: 'zoom-in', overflow: 'hidden',
                                         '& img': { transition: 'transform .2s' }, '&:hover img': { transform: 'scale(1.06)' },
                                     }}>
                                    <img src={item.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            </Box>
        </Drawer>
    );
}
