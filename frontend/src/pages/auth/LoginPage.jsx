import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Box, Link } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import AuthLayout from './AuthLayout';
import FormField from '../../components/form/FormField';
import FormAlert from '../../components/form/FormAlert';
import SubmitButton from '../../components/form/SubmitButton';
import { formErrors } from '../../utils/formErrors';
import { t } from '../../i18n';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({ message: '', fields: {} });
    const [busy, setBusy] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({ message: '', fields: {} });
        setBusy(true);
        try {
            await login(email.trim(), password);
            navigate('/dashboard', { replace: true });
        } catch (err) {
            setErrors(formErrors(err, t('Не вдалося увійти')));
            setBusy(false);
        }
    };

    return (
        <AuthLayout
            title={t('З поверненням')}
            subtitle={t('Увійдіть, щоб побачити всі свої чати.')}
            footer={<>{t('Немає акаунту? ')}<Link component={RouterLink} to="/register" sx={{ fontWeight: 700 }}>{t('Зареєструватися')}</Link></>}
        >
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <FormAlert>{errors.message}</FormAlert>
                <FormField label={t('Електронна пошта')} type="email" name="email" autoComplete="email" autoFocus
                           placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
                           error={errors.fields.email} required />
                <FormField label={t('Пароль')} type="password" name="password" autoComplete="current-password"
                           placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                           error={errors.fields.password} required />
                <SubmitButton busy={busy} busyText={t('Вхід…')} disabled={!email.trim() || !password}>{t('Увійти')}</SubmitButton>
            </Box>
        </AuthLayout>
    );
}
