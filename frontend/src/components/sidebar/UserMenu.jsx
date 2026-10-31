import { useState } from 'react';
import { Box, Typography, Menu, MenuItem, ListItemIcon, Divider, Tooltip } from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../context/AuthContext';
import { initialsOf } from '../../utils/format';
import { radius } from '../../theme/tokens';
import { t } from '../../i18n';

/** Who is signed in, and the way to their settings or out. Replaces the bare logout button. */
export default function UserMenu({ onSettings, onLogout }) {
    const { user } = useAuth();
    const [anchor, setAnchor] = useState(null);
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    const run = (action) => () => { setAnchor(null); action(); };

    return (
        <>
            <Tooltip title={t('Акаунт і налаштування')}>
                <Box
                    role="button"
                    tabIndex={0}
                    aria-label={t('Акаунт і налаштування')}
                    onClick={(e) => setAnchor(e.currentTarget)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setAnchor(e.currentTarget)}
                    sx={(t) => ({
                        width: 28, height: 28, ml: 0.25, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11.5, fontWeight: 800, color: t.c.onAccent,
                        background: `linear-gradient(140deg, ${t.c.accent}, ${t.c.accentHover})`,
                        transition: 'box-shadow .12s',
                        '&:hover, &:focus-visible': { boxShadow: `0 0 0 3px ${t.c.accentSoft}`, outline: 'none' },
                    })}
                >
                    {initialsOf(name || user?.email)}
                </Box>
            </Tooltip>
            <Menu
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: (t) => ({ mt: 1, minWidth: 230, borderRadius: radius.lg, bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, boxShadow: t.c.shadowRaised, backgroundImage: 'none' }) } }}
            >
                <Box sx={{ px: 2, pt: 1, pb: 1.25 }}>
                    <Typography noWrap sx={(t) => ({ fontSize: 14, fontWeight: 700, color: t.c.text })}>{name || t('Без імені')}</Typography>
                    <Typography noWrap sx={(t) => ({ fontSize: 12, color: t.c.textFaint })}>{user?.email}</Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <MenuItem onClick={run(onSettings)}>
                    <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>{t('Налаштування')}
                </MenuItem>
                <MenuItem onClick={run(onLogout)} sx={(t) => ({ color: t.c.danger })}>
                    <ListItemIcon><LogoutIcon fontSize="small" sx={(t) => ({ color: t.c.danger })} /></ListItemIcon>{t('Вийти')}
                </MenuItem>
            </Menu>
        </>
    );
}
