import { useState } from 'react';
import { Box, Typography, Button, Dialog, Skeleton, Switch } from '@mui/material';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import SettingsCard, { SettingRow } from './SettingsCard';
import FormField from '../form/FormField';
import FormAlert from '../form/FormAlert';
import SubmitButton from '../form/SubmitButton';
import { useAuth } from '../../context/AuthContext';
import { usePresentation } from '../../context/PresentationContext';
import userService from '../../services/userService';
import { formErrors } from '../../utils/formErrors';
import { radius, numeric } from '../../theme/tokens';
import { t, LOCALE } from '../../i18n';

const number = (n) => (n ?? 0).toLocaleString(LOCALE);

function Stat({ value, label }) {
    return (
        <Box sx={(t) => ({ p: 1.75, borderRadius: radius.lg, bgcolor: t.c.surfaceSunken })}>
            <Typography sx={(t) => ({ ...numeric, fontSize: 22, fontWeight: 800, color: t.c.text, letterSpacing: '-0.02em' })}>{value}</Typography>
            <Typography sx={(t) => ({ fontSize: 12, color: t.c.textMuted })}>{label}</Typography>
        </Box>
    );
}

/** Asks for the password before removing everything — a stolen session must not be enough. */
function DeleteAccountDialog({ open, onClose }) {
    const { logout } = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const WORD = t('ВИДАЛИТИ');

    const close = () => { setPassword(''); setConfirm(''); setError(''); onClose(); };

    const submit = async (e) => {
        e.preventDefault();
        setError(''); setBusy(true);
        try {
            await userService.deleteAccount(password);
            logout();
        } catch (err) {
            setError(formErrors(err, t('Не вдалося видалити акаунт')).message);
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : close} maxWidth="xs" fullWidth
                slotProps={{ paper: { sx: (t) => ({ p: 3, borderRadius: radius.xl, bgcolor: t.c.surface, backgroundImage: 'none' }) } }}>
            <Box component="form" onSubmit={submit} noValidate>
                <Typography sx={(t) => ({ fontSize: 18, fontWeight: 800, color: t.c.text, mb: 1 })}>{t('Видалити акаунт?')}</Typography>
                <Typography sx={(t) => ({ fontSize: 13.5, color: t.c.textMuted, lineHeight: 1.55, mb: 2.5 })}>
                    {t('Буде видалено акаунт, усі підключення месенджерів, архів повідомлень, пошукові індекси, контакти й результати аналізу. Самі месенджери й листування в них не постраждають. Скасувати це неможливо.')}
                </Typography>
                <FormAlert>{error}</FormAlert>
                <FormField label={t('Пароль')} type="password" autoComplete="current-password" autoFocus
                           value={password} onChange={(e) => setPassword(e.target.value)} />
                <FormField label={t('Введіть «{0}» для підтвердження', WORD)} value={confirm}
                           onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                <SubmitButton danger busy={busy} busyText={t('Видалення…')} disabled={!password || confirm.trim().toUpperCase() !== WORD}>
                    {t('Видалити назавжди')}
                </SubmitButton>
                <Button fullWidth onClick={close} disabled={busy} sx={{ mt: 1, textTransform: 'none', fontWeight: 650 }}>{t('Скасувати')}</Button>
            </Box>
        </Dialog>
    );
}

/** What is stored, where the analysis runs, and the way to remove all of it. */
export default function DataSection({ overview, ai }) {
    const { presenting, setPresenting } = usePresentation();
    const [deleting, setDeleting] = useState(false);

    const aiText = ai == null ? t('Перевіряємо…')
        : !ai.reachable ? t('Ollama не відповідає — аналіз і пошук за змістом недоступні, решта працює.')
            : t('{0} · моделі: {1}', ai.local ? t('Працює на цьому комп’ютері') : t('Працює на {0}', ai.ollamaUrl), ai.models.join(', ') || t('немає'));

    return (
        <>
            <SettingsCard id="data" title={t('Дані й приватність')}
                          description={t('Усе нижче зберігається лише в базі даних цього сервера. Мовні моделі запускаються локально — листування нікуди не надсилається.')}>
                {overview == null ? (
                    <Skeleton variant="rounded" height={84} />
                ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
                        <Stat value={number(overview.chats)} label={t('чатів')} />
                        <Stat value={number(overview.messages)} label={t('повідомлень в архіві')} />
                        <Stat value={number(overview.indexed)} label={t('проіндексовано за змістом')} />
                        <Stat value={number(overview.analyses)} label={t('аналізів і дайджестів')} />
                    </Box>
                )}
                <Box sx={{ mt: 2 }}>
                    <SettingRow first title={t('Режим презентації (Ctrl+Shift+H)')}
                                hint={t('Для показу на проєкторі: імена замінюються на «Контакт 1», фото приховуються, тексти повідомлень і відповіді моделі розмиті, доки на них не навести курсор.')}>
                        <Switch checked={presenting} onChange={(e) => setPresenting(e.target.checked)} />
                    </SettingRow>
                    <SettingRow title={t('Локальна мовна модель')} hint={aiText}>
                        {ai && (
                            <Box sx={(t) => ({ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: ai.reachable ? t.c.success : t.c.danger })} />
                        )}
                    </SettingRow>
                </Box>
            </SettingsCard>

            <SettingsCard id="danger" danger title={t('Видалення акаунту')}
                          description={t('Видаляє акаунт і все, що застосунок зберіг для нього. Дані в самих месенджерах залишаються.')}>
                <Button variant="outlined" color="error" startIcon={<DeleteForeverOutlinedIcon />} onClick={() => setDeleting(true)}
                        sx={{ textTransform: 'none', fontWeight: 650, borderRadius: '9px' }}>
                    {t('Видалити акаунт…')}
                </Button>
            </SettingsCard>

            <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
        </>
    );
}
