import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, IconButton, useMediaQuery } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import SettingsCard from '../components/settings/SettingsCard';
import ProfileSection from '../components/settings/ProfileSection';
import SecuritySection from '../components/settings/SecuritySection';
import NotificationsSection from '../components/settings/NotificationsSection';
import MessengersSection from '../components/settings/MessengersSection';
import DataSection from '../components/settings/DataSection';
import AppearanceControls from '../components/AppearanceControls';
import userService from '../services/userService';
import systemService from '../services/systemService';
import { radius } from '../theme/tokens';
import { t } from '../i18n';

const SECTIONS = [
    ['profile', t('Профіль'), PersonOutlineRoundedIcon],
    ['security', t('Безпека'), LockOutlinedIcon],
    ['appearance', t('Оформлення'), PaletteOutlinedIcon],
    ['notifications', t('Сповіщення'), NotificationsNoneRoundedIcon],
    ['messengers', t('Месенджери'), HubOutlinedIcon],
    ['data', t('Дані й приватність'), StorageRoundedIcon],
];

/** All account settings on one scrolling page, with a table of contents that follows the scroll. */
export default function SettingsPage() {
    const navigate = useNavigate();
    const wide = useMediaQuery('(min-width: 900px)');
    const [active, setActive] = useState('profile');
    const [overview, setOverview] = useState(null);
    const [ai, setAi] = useState(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        userService.overview().then(data => { if (!cancelled) setOverview(data); }).catch(() => { /* cards show their skeleton */ });
        systemService.getStatus().then(st => { if (!cancelled) setAi(st.ai); })
            .catch(() => { if (!cancelled) setAi({ reachable: false, models: [] }); });
        return () => { cancelled = true; };
    }, []);

    // The contents follow whichever section is nearest the top of the view.
    useEffect(() => {
        const root = scrollRef.current;
        if (!root) return undefined;
        const observer = new IntersectionObserver((entries) => {
            const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visible[0]) setActive(visible[0].target.id === 'danger' ? 'data' : visible[0].target.id);
        }, { root, rootMargin: '0px 0px -65% 0px' });
        root.querySelectorAll('section[id]').forEach(section => observer.observe(section));
        return () => observer.disconnect();
    }, []);

    const jump = (id) => scrollRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <Box sx={(t) => ({ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: t.c.bg })}>
            <Box component="header" sx={(t) => ({
                display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, sm: 3 }, py: 1.5, flexShrink: 0,
                bgcolor: t.c.surfaceAlt, borderBottom: `1px solid ${t.c.border}`,
            })}>
                <IconButton onClick={() => navigate('/dashboard')} aria-label={t('До чатів')}>
                    <ArrowBackRoundedIcon />
                </IconButton>
                <Typography component="h1" sx={(t) => ({ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: t.c.text })}>
                    {t('Налаштування')}
                </Typography>
            </Box>

            <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto' }}>
                <Box sx={{ maxWidth: 1040, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3, display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                    {wide && (
                        <Box component="nav" aria-label={t('Розділи налаштувань')} sx={{ width: 220, flexShrink: 0, position: 'sticky', top: 24 }}>
                            {SECTIONS.map(([id, label, Icon]) => (
                                <Box key={id} role="button" tabIndex={0}
                                     onClick={() => jump(id)}
                                     onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && jump(id)}
                                     sx={(t) => ({
                                         display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1, mb: 0.25,
                                         borderRadius: radius.md, cursor: 'pointer', fontSize: 14,
                                         fontWeight: active === id ? 700 : 550,
                                         color: active === id ? t.c.accentText : t.c.textMuted,
                                         bgcolor: active === id ? t.c.accentSoft : 'transparent',
                                         transition: 'background-color .12s, color .12s',
                                         '&:hover': active === id ? {} : { bgcolor: t.c.surfaceHover, color: t.c.text },
                                     })}>
                                    <Icon sx={{ fontSize: 19 }} />
                                    {label}
                                </Box>
                            ))}
                        </Box>
                    )}

                    <Box sx={{ flex: 1, minWidth: 0, maxWidth: 720 }}>
                        <ProfileSection />
                        <SecuritySection />
                        <SettingsCard id="appearance" title={t('Оформлення')} description={t('Зберігається в цьому браузері.')}>
                            <Box sx={{ maxWidth: 360 }}><AppearanceControls /></Box>
                        </SettingsCard>
                        <NotificationsSection />
                        <MessengersSection accounts={overview?.accounts} />
                        <DataSection overview={overview} ai={ai} />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
