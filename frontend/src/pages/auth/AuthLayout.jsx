import { Box, Typography, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import MessengerGlyph from '../../components/sidebar/MessengerGlyph';
import { useThemeMode } from '../../context/ThemeModeContext';
import { radius } from '../../theme/tokens';
import { LANGUAGE, setLanguage } from '../../i18n';
import { t } from '../../i18n';

const NETWORKS = ['TELEGRAM', 'WHATSAPP', 'SLACK', 'DISCORD', 'VIBER'];

/** What the product is, in the three sentences someone needs before signing up. */
const FEATURES = [
    [ForumRoundedIcon, t('Усі месенджери в одному вікні'), t('Telegram, WhatsApp, Slack, Discord і Viber — один список чатів, одна стрічка непрочитаних.')],
    [TravelExploreRoundedIcon, t('Пошук за змістом'), t('Знаходить повідомлення за сенсом, а не лише за словами: «де домовлялись про зустріч».')],
    [ShieldOutlinedIcon, t('Аналіз — на вашому комп’ютері'), t('Мовні моделі працюють локально. Листування не надсилається в жодну хмару.')],
];

export function LogoMark({ size = 40 }) {
    return (
        <Box sx={(t) => ({
            width: size, height: size, borderRadius: radius.lg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(140deg, ${t.c.accent}, ${t.c.accentHover})`,
            color: t.c.onAccent, boxShadow: `0 6px 18px ${t.c.accentSoft}`,
        })}>
            <ForumRoundedIcon sx={{ fontSize: size * 0.55 }} />
        </Box>
    );
}

/** The left half: who we are. Hidden on narrow screens, where the form needs the room. */
function BrandPanel() {
    return (
        <Box sx={(t) => ({
            position: 'relative', overflow: 'hidden',
            flex: '0 0 44%', maxWidth: 560, p: 6,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            color: '#fff',
            background: `linear-gradient(155deg, ${t.c.accent} 0%, ${t.c.accentHover} 55%, #111318 140%)`,
        })}>
            {/* Soft shapes so the colour is not a flat slab. */}
            <Box sx={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', top: -140, right: -160, bgcolor: 'rgba(255,255,255,0.08)' }} />
            <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', bottom: -90, left: -80, bgcolor: 'rgba(255,255,255,0.06)' }} />

            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: radius.lg, bgcolor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ForumRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
                <Typography sx={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Messenger Hub</Typography>
            </Box>

            <Box sx={{ position: 'relative' }}>
                <Typography sx={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', mb: 1.5 }}>
                    {t('Усе листування —')}<br />{t('в одному місці.')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 4 }}>
                    {NETWORKS.map(type => (
                        <Box key={type} sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MessengerGlyph type={type} size={16} />
                        </Box>
                    ))}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
                    {FEATURES.map(([Icon, title, text]) => (
                        <Box key={title} sx={{ display: 'flex', gap: 1.5 }}>
                            <Box sx={{ width: 34, height: 34, flexShrink: 0, borderRadius: radius.md, bgcolor: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon sx={{ fontSize: 18 }} />
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{title}</Typography>
                                <Typography sx={{ fontSize: 12.5, opacity: 0.82, lineHeight: 1.5 }}>{text}</Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>

            <Typography sx={{ position: 'relative', fontSize: 11.5, opacity: 0.7 }}>
                {t('Дані зберігаються лише на сервері, де встановлено застосунок.')}
            </Typography>
        </Box>
    );
}

/** Frame of the sign-in and sign-up pages: product panel, form, theme switch. */
export default function AuthLayout({ title, subtitle, children, footer }) {
    const wide = useMediaQuery('(min-width: 900px)');
    const { mode, setMode } = useThemeMode();

    return (
        <Box sx={(t) => ({ minHeight: '100vh', display: 'flex', bgcolor: t.c.bg })}>
            {wide && <BrandPanel />}

            <Box sx={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2.5, sm: 4 } }}>
                <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title={LANGUAGE === 'en' ? t('Українська') : 'English'}>
                    <IconButton onClick={() => setLanguage(LANGUAGE === 'en' ? 'uk' : 'en')}
                                sx={{ fontSize: 13, fontWeight: 750, width: 36, height: 36 }}>
                        {LANGUAGE === 'en' ? 'UA' : 'EN'}
                    </IconButton>
                </Tooltip>
                <Tooltip title={mode === 'dark' ? t('Світла тема') : t('Темна тема')}>
                    <IconButton onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
                        {mode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
                    </IconButton>
                </Tooltip>
                </Box>

                <Box sx={{ width: '100%', maxWidth: 400, animation: 'authIn .35s ease-out', '@keyframes authIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } } }}>
                    {!wide && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 4 }}>
                            <LogoMark size={36} />
                            <Typography sx={(t) => ({ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: t.c.text })}>Messenger Hub</Typography>
                        </Box>
                    )}
                    <Typography component="h1" sx={(t) => ({ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: t.c.text })}>
                        {title}
                    </Typography>
                    <Typography sx={(t) => ({ fontSize: 14, color: t.c.textMuted, mt: 0.75, mb: 3.5 })}>
                        {subtitle}
                    </Typography>
                    {children}
                    {footer && (
                        <Typography sx={(t) => ({ fontSize: 13.5, color: t.c.textMuted, textAlign: 'center', mt: 3 })}>
                            {footer}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
