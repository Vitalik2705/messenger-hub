import { Box, Typography, Button, Skeleton } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import SettingsCard from './SettingsCard';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { MESSENGER_LABELS, radius } from '../../theme/tokens';
import { formatListTime } from '../../utils/format';
import { t } from '../../i18n';

/**
 * The connected accounts, read-only here. Connecting and disconnecting stay on the main
 * screen, where the login dialogs live and the result — the chats — is immediately visible.
 */
export default function MessengersSection({ accounts }) {
    const navigate = useNavigate();
    const manage = () => navigate('/dashboard', { state: { openAccounts: true } });

    return (
        <SettingsCard id="messengers" title={t('Месенджери')} description={t('Акаунти, з яких збираються чати. Сесії зберігаються зашифрованими.')}>
            {accounts == null ? (
                <Skeleton variant="rounded" height={56} />
            ) : accounts.length === 0 ? (
                <Typography sx={(t) => ({ fontSize: 13.5, color: t.c.textMuted, mb: 1 })}>{t('Жодного месенджера ще не підключено.')}</Typography>
            ) : (
                <Box sx={(t) => ({ border: `1px solid ${t.c.border}`, borderRadius: radius.lg, overflow: 'hidden' })}>
                    {accounts.map((account, i) => (
                        <Box key={account.id} sx={(t) => ({
                            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.4,
                            borderTop: i ? `1px solid ${t.c.border}` : 'none',
                        })}>
                            <Box sx={(t) => ({ width: 34, height: 34, borderRadius: '50%', bgcolor: t.c.surfaceSunken, display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                                <MessengerGlyph type={account.messengerType} size={16} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography noWrap sx={(t) => ({ fontSize: 14, fontWeight: 650, color: t.c.text })}>
                                    {account.label || MESSENGER_LABELS[account.messengerType]}
                                </Typography>
                                <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint })}>
                                    {MESSENGER_LABELS[account.messengerType]}
                                    {account.lastSyncAt && t(' · синхронізовано {0}', formatListTime(account.lastSyncAt).toLowerCase())}
                                </Typography>
                            </Box>
                            <Box sx={(t) => ({
                                fontSize: 11.5, fontWeight: 700, px: 1, py: 0.35, borderRadius: radius.pill,
                                color: account.connected ? t.c.success : t.c.textFaint,
                                bgcolor: account.connected ? `${t.c.success}1A` : t.c.surfaceSunken,
                            })}>
                                {account.connected ? t('Підключено') : t('Відключено')}
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}
            <Button startIcon={<AddIcon />} onClick={manage}
                    sx={{ mt: 2, textTransform: 'none', fontWeight: 650, borderRadius: '9px' }}>
                {t('Керувати підключеннями')}
            </Button>
        </SettingsCard>
    );
}
