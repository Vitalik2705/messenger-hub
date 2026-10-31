import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import SyncIcon from '@mui/icons-material/Sync';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { useThemeMode } from '../../context/ThemeModeContext';
import AccountsButton from './AccountsButton';
import { radius, numeric } from '../../theme/tokens';

/**
 * Title, what is in the inbox, and the actions that belong to the app rather than to a chat.
 *
 * The connected accounts live on the metadata line rather than in a strip of their own. That
 * line was already there and already half empty, so what used to be five wrapped rows above
 * the search field now costs nothing at all.
 */
export default function SidebarHeader({ chatCount, totalUnread, syncing, accounts,
                                        onSync, onContacts, onAccounts, onCompose,
                                        onAnalytics, onLogout }) {
    const { mode, toggleMode } = useThemeMode();

    return (
        <Box sx={{ px: 2, pt: 2.25, pb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={(t) => ({
                    flex: 1, minWidth: 0,
                    fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em',
                    color: t.c.text, lineHeight: 1.2,
                })}>
                    Messenger&nbsp;Hub
                </Typography>

                <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
                    <Tooltip title="Написати — Ctrl+K">
                        <IconButton
                            size="small" onClick={onCompose}
                            sx={(t) => ({
                                width: 30, height: 30, borderRadius: `${radius.md}`,
                                color: t.c.accentText,
                                '&:hover': { bgcolor: t.c.accentSoft },
                            })}
                        >
                            <EditOutlinedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Контакти між мережами">
                        <IconButton size="small" onClick={onContacts} sx={{ width: 30, height: 30, borderRadius: `${radius.md}` }}>
                            <PeopleAltOutlinedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={syncing ? 'Синхронізація…' : 'Синхронізувати'}>
                        <IconButton
                            size="small" onClick={onSync} disabled={syncing}
                            sx={{
                                width: 30, height: 30, borderRadius: `${radius.md}`,
                                animation: syncing ? 'spin 1s linear infinite' : 'none',
                                '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                            }}
                        >
                            <SyncIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={mode === 'dark' ? 'Світла тема' : 'Темна тема'}>
                        <IconButton size="small" onClick={toggleMode} sx={{ width: 30, height: 30, borderRadius: `${radius.md}` }}>
                            {mode === 'dark'
                                ? <LightModeOutlinedIcon sx={{ fontSize: 17 }} />
                                : <DarkModeOutlinedIcon sx={{ fontSize: 17 }} />}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Вийти">
                        <IconButton
                            size="small" onClick={onLogout}
                            sx={(t) => ({
                                width: 30, height: 30, borderRadius: `${radius.md}`,
                                '&:hover': { color: t.c.danger, bgcolor: t.c.accentSoft },
                            })}
                        >
                            <LogoutIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* The inbox on the left, what feeds it on the right — one line, both facts. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.35, minHeight: 24 }}>
                <Typography sx={(t) => ({ ...numeric, fontSize: 11.5, color: t.c.textFaint })}>
                    {chatCount} {chatCount === 1 ? 'чат' : 'чатів'}
                </Typography>
                {totalUnread > 0 && (
                    <>
                        <Box sx={(t) => ({ width: 3, height: 3, borderRadius: '50%', bgcolor: t.c.textFaint })} />
                        <Typography sx={(t) => ({
                            ...numeric, fontSize: 11.5, fontWeight: 700, color: t.c.accentText,
                        })}>
                            {totalUnread > 999 ? '999+' : totalUnread} нових
                        </Typography>
                    </>
                )}

                <Box sx={{ flex: 1 }} />

                {/* A destination rather than an action, so it sits on this line instead of
                    joining the icon row above — which has no width left in a 330px sidebar. */}
                <Tooltip title="Аналітика чатів">
                    <Box
                        onClick={onAnalytics}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAnalytics()}
                        sx={(t) => ({
                            display: 'flex', alignItems: 'center',
                            px: 0.7, py: 0.3, mr: 0.5,
                            borderRadius: radius.pill,
                            cursor: 'pointer', color: t.c.textFaint,
                            border: '1px solid transparent',
                            '&:hover': { color: t.c.accentText, bgcolor: t.c.surfaceHover, borderColor: t.c.border },
                        })}
                    >
                        <InsightsIcon sx={{ fontSize: 15 }} />
                    </Box>
                </Tooltip>

                <AccountsButton accounts={accounts} onClick={onAccounts} />
            </Box>
        </Box>
    );
}
