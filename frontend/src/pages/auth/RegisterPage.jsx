import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Box, Link } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import AuthLayout from './AuthLayout';
import FormField from '../../components/form/FormField';
import FormAlert from '../../components/form/FormAlert';
import SubmitButton from '../../components/form/SubmitButton';
import PasswordMeter from '../../components/form/PasswordMeter';
import { formErrors } from '../../utils/formErrors';
import { t } from '../../i18n';

const EMPTY = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' };

export default function RegisterPage() {
    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState({ message: '', fields: {} });
    const [busy, setBusy] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const field = (name) => ({
        name,
        value: form[name],
        onChange: (e) => setForm(prev => ({ ...prev, [name]: e.target.value })),
        error: errors.fields[name],
    });

    // Said while typing rather than after a round trip: both are knowable here.
    const tooShort = form.password.length > 0 && form.password.length < 8;
    const mismatch = form.confirmPassword.length > 0 && form.confirmPassword !== form.password;
    const ready = form.email.trim() && form.password.length >= 8 && form.password === form.confirmPassword;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!ready) return;
        setErrors({ message: '', fields: {} });
        setBusy(true);
        try {
            await register({ ...form, email: form.email.trim() });
            navigate('/dashboard', { replace: true });
        } catch (err) {
            setErrors(formErrors(err, t('Не вдалося створити акаунт')));
            setBusy(false);
        }
    };

    return (
        <AuthLayout
            title={t('Створіть акаунт')}
            subtitle={t('Хвилина — і можна підключати перший месенджер.')}
            footer={<>{t('Вже є акаунт? ')}<Link component={RouterLink} to="/login" sx={{ fontWeight: 700 }}>{t('Увійти')}</Link></>}
        >
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <FormAlert>{errors.message}</FormAlert>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 1.5 }}>
                    <FormField label={t('Ім\'я')} autoComplete="given-name" autoFocus placeholder={t('Олена')} {...field('firstName')} />
                    <FormField label={t('Прізвище')} autoComplete="family-name" placeholder={t('Коваль')} {...field('lastName')} />
                </Box>
                <FormField label={t('Електронна пошта')} type="email" autoComplete="email" placeholder="you@example.com" {...field('email')} />
                <FormField label={t('Пароль')} type="password" autoComplete="new-password" placeholder={t('Щонайменше 8 символів')}
                           {...field('password')}
                           error={errors.fields.password || (tooShort ? t('Щонайменше 8 символів') : '')} />
                <PasswordMeter password={form.password} />
                <FormField label={t('Повторіть пароль')} type="password" autoComplete="new-password"
                           {...field('confirmPassword')}
                           error={errors.fields.confirmPassword || (mismatch ? t('Паролі не збігаються') : '')} />
                <SubmitButton busy={busy} busyText={t('Створення акаунту…')} disabled={!ready}>{t('Зареєструватися')}</SubmitButton>
            </Box>
        </AuthLayout>
    );
}
