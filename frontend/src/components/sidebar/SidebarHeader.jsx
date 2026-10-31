import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import AppearanceMenu from './AppearanceMenu';
import AccountsButton from './AccountsButton';
import UserMenu from './UserMenu';
import { radius, numeric } from '../../theme/tokens';
import { t } from '../../i18n';

/** Title, inbox counts, the app-level actions, and the connected accounts on the metadata line. */
export default function SidebarHeader({ chatCount, totalUnread, syncing, accounts,
                                        onSync, onContacts, onAccounts, onCompose,
                                        onAnalytics, onSystemStatus, onSettings, onLogout }) {
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
                    <Tooltip title={t('Написати')}>
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

                    <Tooltip title={t('Контакти між мережами')}>
                        <IconButton size="small" onClick={onContacts} sx={{ width: 30, height: 30, borderRadius: `${radius.md}` }}>
                            <PeopleAltOutlinedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={syncing ? t('Синхронізація…') : t('Синхронізувати')}>
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

                    <AppearanceMenu />

                    <UserMenu onSettings={onSettings} onLogout={onLogout} />
                </Box>
            </Box>

            {/* The inbox on the left, what feeds it on the right — one line, both facts. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.35, minHeight: 24 }}>
                <Typography sx={(t) => ({ ...numeric, fontSize: 11.5, color: t.c.textFaint })}>
                    {chatCount} {chatCount === 1 ? t('чат') : t('чатів')}
                </Typography>
                {totalUnread > 0 && (
                    <>
                        <Box sx={(t) => ({ width: 3, height: 3, borderRadius: '50%', bgcolor: t.c.textFaint })} />
                        <Typography sx={(t) => ({
                            ...numeric, fontSize: 11.5, fontWeight: 700, color: t.c.accentText,
                        })}>
                            {totalUnread > 999 ? '999+' : totalUnread}{t(' нових')}
                        </Typography>
                    </>
                )}

                <Box sx={{ flex: 1 }} />

                {/* A destination rather than an action, so it sits on this line instead of
                    joining the icon row above — which has no width left in a 330px sidebar. */}
                <Tooltip title={t('Аналітика чатів')}>
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

                <Tooltip title={t('Стан системи')}>
                    <Box
                        onClick={onSystemStatus}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSystemStatus()}
                        sx={(t) => ({
                            display: 'flex', alignItems: 'center',
                            px: 0.7, py: 0.3, mr: 0.5,
                            borderRadius: radius.pill,
                            cursor: 'pointer', color: t.c.textFaint,
                            border: '1px solid transparent',
                            '&:hover': { color: t.c.accentText, bgcolor: t.c.surfaceHover, borderColor: t.c.border },
                        })}
                    >
                        <MonitorHeartOutlinedIcon sx={{ fontSize: 15 }} />
                    </Box>
                </Tooltip>

                <AccountsButton accounts={accounts} onClick={onAccounts} />
            </Box>
        </Box>
    );
}
