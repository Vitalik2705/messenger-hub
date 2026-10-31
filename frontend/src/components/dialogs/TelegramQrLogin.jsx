import { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import telegramService from '../../services/telegramService';
import { t } from '../../i18n';

const inp = {
    width: '100%', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '10px 14px', color: 'var(--c-text)', fontSize: 13.5,
    outline: 'none', boxSizing: 'border-box',
};

const errorText = (e, fallback) => t(e.response?.data?.detail || e.response?.data?.message) || fallback;

/**
 * Login by scanning a QR code with a phone already signed in. Works when Telegram stops delivering
 * login codes to third-party clients. Owns its polling; reports only success.
 */
const TelegramQrLogin = ({ onConnected }) => {
    // loading | qr | password | expired | failed | connected
    const [stage, setStage] = useState('loading');
    const [qrImage, setQrImage] = useState(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const loginIdRef = useRef(null);
    const pollRef = useRef(null);

    const stopPolling = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    const finish = () => {
        stopPolling();
        setStage('connected');
        setTimeout(() => onConnected && onConnected(), 800);
    };

    const poll = async () => {
        try {
            const r = await telegramService.qrStatus(loginIdRef.current);
            if (r.status === 'pending') { if (r.qr_image) setQrImage(r.qr_image); }
            else if (r.status === 'authorized') finish();
            else if (r.status === 'password_required') { stopPolling(); setStage('password'); }
            else if (r.status === 'expired') { stopPolling(); setStage('expired'); }
            else { stopPolling(); setError(r.error || t('Не вдалося увійти')); setStage('failed'); }
        } catch (e) {
            stopPolling();
            setError(errorText(e, t('Не вдалося перевірити статус входу')));
            setStage('failed');
        }
    };

    const start = async () => {
        stopPolling();
        setError(''); setStage('loading');
        try {
            const r = await telegramService.qrStart();
            loginIdRef.current = r.login_id;
            setQrImage(r.qr_image);
            setStage('qr');
            pollRef.current = setInterval(poll, 2000);
        } catch (e) {
            setError(errorText(e, t('Не вдалося отримати QR-код')));
            setStage('failed');
        }
    };

    const submitPassword = async () => {
        if (busy || !password) return;
        setBusy(true); setError('');
        try {
            await telegramService.qrPassword(loginIdRef.current, password);
            finish();
        } catch (e) {
            setError(errorText(e, t('Невірний пароль')));
        } finally {
            setBusy(false);
        }
    };

    // Starts on mount and cleans up on unmount; start/stop only touch refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { start(); return stopPolling; }, []);

    return (
        <Box sx={{ textAlign: 'center' }}>
            {error && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-accent-soft)', border: '1px solid var(--c-border)', borderRadius: 2, textAlign: 'left' }}>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-danger)' }}>⚠ {error}</Typography>
                </Box>
            )}

            {stage === 'loading' && <CircularProgress size={28} sx={{ my: 6, color: 'var(--c-accent)' }} />}

            {stage === 'qr' && qrImage && (
                <>
                    <Box component="img" src={qrImage} alt={t('QR-код для входу в Telegram')}
                        sx={{ width: 220, height: 220, bgcolor: '#fff', borderRadius: 2, p: 1, border: '1px solid var(--c-border)' }} />
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mt: 1.5, lineHeight: 1.6 }}>
                        {t('На телефоні: Telegram → Налаштування → Пристрої →')}<br />{t('«Підключити пристрій» і наведіть камеру на код')}
                    </Typography>
                </>
            )}

            {stage === 'password' && (
                <Box sx={{ textAlign: 'left' }}>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 1.5 }}>
                        {t('Код відскановано. Введіть пароль двоетапної перевірки')}
                    </Typography>
                    <input autoFocus type="password" placeholder={t('Пароль')} value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitPassword()} style={inp} />
                    <Box onClick={submitPassword} sx={{
                        mt: 2, p: 1.3, textAlign: 'center', borderRadius: 2, cursor: busy ? 'default' : 'pointer',
                        background: busy ? 'var(--c-surface-sunken)' : 'linear-gradient(135deg, var(--c-accent), var(--c-accent-hover))',
                        color: busy ? 'var(--c-text-faint)' : 'var(--c-surface)', fontSize: 14, fontWeight: 600,
                    }}>
                        {busy ? t('Будь ласка, зачекайте...') : t('Підтвердити →')}
                    </Box>
                </Box>
            )}

            {(stage === 'expired' || stage === 'failed') && (
                <>
                    {stage === 'expired' && (
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-faint)', my: 2 }}>
                            {t('Час на сканування минув')}
                        </Typography>
                    )}
                    <Typography onClick={start} sx={{ fontSize: 13, color: 'var(--c-accent)', cursor: 'pointer', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}>
                        {t('Показати новий QR-код')}
                    </Typography>
                </>
            )}

            {stage === 'connected' && (
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', my: 5 }}>
                    {t('✓ Telegram підключено')}
                </Typography>
            )}
        </Box>
    );
};

export default TelegramQrLogin;
