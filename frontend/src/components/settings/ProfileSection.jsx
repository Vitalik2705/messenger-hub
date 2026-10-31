import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import SettingsCard from './SettingsCard';
import FormField from '../form/FormField';
import FormAlert from '../form/FormAlert';
import SubmitButton from '../form/SubmitButton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import userService from '../../services/userService';
import { formErrors } from '../../utils/formErrors';
import { initialsOf } from '../../utils/format';
import { t, LOCALE } from '../../i18n';

const since = (value) => (value
    ? new Date(value).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
    : null);

export default function ProfileSection() {
    const { user, updateUser } = useAuth();
    const toast = useToast();
    const [firstName, setFirstName] = useState(user?.firstName || '');
    const [lastName, setLastName] = useState(user?.lastName || '');
    const [errors, setErrors] = useState({ message: '', fields: {} });
    const [busy, setBusy] = useState(false);

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const changed = firstName.trim() !== (user?.firstName || '') || lastName.trim() !== (user?.lastName || '');

    const save = async (e) => {
        e.preventDefault();
        setErrors({ message: '', fields: {} });
        setBusy(true);
        try {
            const updated = await userService.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
            updateUser(updated);
            toast(t('Профіль збережено'), 'success');
        } catch (err) {
            setErrors(formErrors(err, t('Не вдалося зберегти профіль')));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsCard id="profile" title={t('Профіль')} description={t('Як вас називає застосунок. Месенджери цих даних не отримують.')}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Box sx={(t) => ({
                    width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 800, color: t.c.onAccent,
                    background: `linear-gradient(140deg, ${t.c.accent}, ${t.c.accentHover})`,
                })}>
                    {initialsOf(fullName || user?.email || '?')}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={(t) => ({ fontSize: 17, fontWeight: 750, color: t.c.text })}>{fullName || t('Без імені')}</Typography>
                    <Typography noWrap sx={(t) => ({ fontSize: 13, color: t.c.textMuted })}>{user?.email}</Typography>
                    {since(user?.createdAt) && (
                        <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint, mt: 0.25 })}>
                            {t('У Messenger Hub з ')}{since(user.createdAt)}
                        </Typography>
                    )}
                </Box>
            </Box>

            <Box component="form" onSubmit={save} noValidate>
                <FormAlert>{errors.message}</FormAlert>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 1.5 }}>
                    <FormField label={t('Ім\'я')} autoComplete="given-name" value={firstName}
                               onChange={(e) => setFirstName(e.target.value)} error={errors.fields.firstName} maxLength={60} />
                    <FormField label={t('Прізвище')} autoComplete="family-name" value={lastName}
                               onChange={(e) => setLastName(e.target.value)} error={errors.fields.lastName} maxLength={60} />
                </Box>
                <FormField label={t('Електронна пошта')} value={user?.email || ''} disabled
                           hint={t('Пошта — це ваш логін, тому її не змінити.')} />
                <Box sx={{ maxWidth: 220 }}>
                    <SubmitButton busy={busy} busyText={t('Збереження…')} disabled={!changed}>{t('Зберегти')}</SubmitButton>
                </Box>
            </Box>
        </SettingsCard>
    );
}
