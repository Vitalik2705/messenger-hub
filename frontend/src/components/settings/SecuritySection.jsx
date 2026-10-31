import { useState } from 'react';
import { Box, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsCard, { SettingRow } from './SettingsCard';
import FormField from '../form/FormField';
import FormAlert from '../form/FormAlert';
import SubmitButton from '../form/SubmitButton';
import PasswordMeter from '../form/PasswordMeter';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import userService from '../../services/userService';
import authService from '../../services/authService';
import { formErrors } from '../../utils/formErrors';
import { t } from '../../i18n';

const EMPTY = { current: '', next: '', repeat: '' };

export default function SecuritySection() {
    const { user, logout } = useAuth();
    const toast = useToast();
    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState({ message: '', fields: {} });
    const [busy, setBusy] = useState(false);

    const set = (name) => (e) => setForm(prev => ({ ...prev, [name]: e.target.value }));
    const tooShort = form.next.length > 0 && form.next.length < 8;
    const mismatch = form.repeat.length > 0 && form.repeat !== form.next;
    const ready = form.current && form.next.length >= 8 && form.next === form.repeat;

    const endOthers = async () => {
        try {
            authService.adoptTokens(await userService.endOtherSessions());
            toast(t('Інші пристрої вийшли з акаунту'), 'success');
        } catch {
            toast(t('Не вдалося завершити сесії'), 'error');
        }
    };

    const save = async (e) => {
        e.preventDefault();
        if (!ready) return;
        setErrors({ message: '', fields: {} });
        setBusy(true);
        try {
            authService.adoptTokens(await userService.changePassword(form.current, form.next));
            setForm(EMPTY);
            toast(t('Пароль змінено. Інші пристрої вийшли з акаунту'), 'success');
        } catch (err) {
            setErrors(formErrors(err, t('Не вдалося змінити пароль')));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsCard id="security" title={t('Безпека')} description={t('Після зміни пароля всі інші пристрої виходять з акаунту; цей залишається.')}>
            <Box component="form" onSubmit={save} noValidate sx={{ maxWidth: 420 }}>
                {/* Tells password managers whose password this is. */}
                <input type="text" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden />
                <FormAlert>{errors.message}</FormAlert>
                <FormField label={t('Поточний пароль')} type="password" autoComplete="current-password"
                           value={form.current} onChange={set('current')} error={errors.fields.currentPassword} />
                <FormField label={t('Новий пароль')} type="password" autoComplete="new-password" placeholder={t('Щонайменше 8 символів')}
                           value={form.next} onChange={set('next')}
                           error={errors.fields.newPassword || (tooShort ? t('Щонайменше 8 символів') : '')} />
                <PasswordMeter password={form.next} />
                <FormField label={t('Повторіть новий пароль')} type="password" autoComplete="new-password"
                           value={form.repeat} onChange={set('repeat')} error={mismatch ? t('Паролі не збігаються') : ''} />
                <Box sx={{ maxWidth: 220 }}>
                    <SubmitButton busy={busy} busyText={t('Збереження…')} disabled={!ready}>{t('Змінити пароль')}</SubmitButton>
                </Box>
            </Box>

            <Box sx={{ mt: 3 }}>
                <SettingRow first title={t('Вийти на всіх інших пристроях')} hint={t('Якщо входили з чужого комп’ютера. Цей браузер залишиться в акаунті.')}>
                    <Button variant="outlined" color="inherit" onClick={endOthers}
                            sx={{ textTransform: 'none', fontWeight: 650, borderRadius: '9px', flexShrink: 0 }}>
                        {t('Завершити сесії')}
                    </Button>
                </SettingRow>
                <SettingRow title={t('Вийти з акаунту')} hint={t('На цьому пристрої. Чати й налаштування залишаться на сервері.')}>
                    <Button variant="outlined" color="inherit" startIcon={<LogoutIcon />} onClick={logout}
                            sx={{ textTransform: 'none', fontWeight: 650, borderRadius: '9px', flexShrink: 0 }}>
                        {t('Вийти')}
                    </Button>
                </SettingRow>
            </Box>
        </SettingsCard>
    );
}
