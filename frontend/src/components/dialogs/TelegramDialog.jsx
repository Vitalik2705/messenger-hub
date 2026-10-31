import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import TelegramIcon from '@mui/icons-material/Telegram';
import TelegramQrLogin from './TelegramQrLogin';
import ConnectDialogShell, { ErrorNote, PrimaryButton, Field } from './ConnectDialogShell';
import telegramService from '../../services/telegramService';
import { t } from '../../i18n';

// Telegram decides where the login code goes, and it is rarely an SMS. Saying where it
// actually went is the difference between "the code never came" and "it is in my email".
const DELIVERY_TEXT = {
    app: t('Код надіслано в чат «Telegram» (офіційний, із синьою галочкою) на іншому вашому пристрої'),
    sms: t('Код надіслано SMS'),
    call: t('Telegram зателефонує — код буде в останніх цифрах номера або продиктований'),
    email: t('Код надіслано на пошту'),
    email_setup: t('Telegram вимагає привʼязати пошту до акаунта. Зробіть це в офіційному застосунку й спробуйте знову'),
    fragment: t('Код надіслано через Fragment (fragment.com) — для анонімних номерів'),
};
const NEXT_TEXT = { sms: t('Надіслати SMS'), call: t('Подзвонити мені'), fragment: t('Надіслати через Fragment') };

const deliveryText = (d) => {
    const base = DELIVERY_TEXT[d?.delivery] || t('Перевірте чат «Telegram» на іншому пристрої, SMS або пошту');
    return d?.delivery === 'email' && d.delivery_hint ? `${base} ${d.delivery_hint}` : base;
};

const errorText = (e, fallback) => t(e.response?.data?.detail || e.response?.data?.message) || fallback;

const linkSx = { mt: 2, fontSize: 12, textAlign: 'center', color: 'var(--c-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--c-accent)' } };

const STEPS = [t('Телефон'), t('Код'), '2FA'];
const FRESH = { step: 0, phone: '', code: '', password: '', phoneCodeHash: '', session: '', delivery: null };

/**
 * Connects a Telegram account by phone number (code, then 2FA password if set) or by QR code.
 * Reports only success upward.
 */
export default function TelegramDialog({ open, onClose, onConnected }) {
    const [method, setMethod] = useState('phone');
    const [login, setLogin] = useState(FRESH);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const set = (patch) => setLogin(prev => ({ ...prev, ...patch }));

    const close = () => { setMethod('phone'); setLogin(FRESH); setError(''); onClose(); };
    const done = () => { setMethod('phone'); setLogin(FRESH); setError(''); onConnected(); };

    const attempt = async (action, fallback) => {
        setError(''); setBusy(true);
        try { await action(); } catch (e) { setError(errorText(e, fallback)); } finally { setBusy(false); }
    };

    const sendCode = () => attempt(async () => {
        const r = await telegramService.sendCode(login.phone);
        set({ step: 1, phoneCodeHash: r.phone_code_hash, session: r.session, delivery: r });
    }, t('Не вдалося надіслати код'));

    const resendCode = () => attempt(async () => {
        const r = await telegramService.resendCode(login.phone, login.phoneCodeHash);
        set({ phoneCodeHash: r.phone_code_hash, delivery: r, code: '' });
    }, t('Не вдалося надіслати код повторно'));

    const signIn = () => attempt(async () => {
        const r = await telegramService.signIn({ phone: login.phone, code: login.code, phone_code_hash: login.phoneCodeHash, session: login.session });
        if (r.requires_password) set({ step: 2, session: r.session });
        else done();
    }, t('Невірний код'));

    const signInPassword = () => attempt(async () => {
        await telegramService.signInPassword({ phone: login.phone, password: login.password, session: login.session });
        done();
    }, t('Невірний пароль'));

    const submit = [sendCode, signIn, signInPassword][login.step];
    const onEnter = (e) => { if (e.key === 'Enter' && !busy) submit(); };

    return (
        <ConnectDialogShell
            open={open} onClose={close}
            icon={<TelegramIcon sx={{ fontSize: 18, color: '#0088cc' }} />} iconBg="#e8f4fb"
            title={t('Підключити Telegram')}
            subtitle={method === 'qr' ? t('Увійдіть за QR-кодом') : t('Увійдіть за номером телефону')}
        >
            {method === 'qr' ? (
                <>
                    <TelegramQrLogin onConnected={done} />
                    <Typography onClick={() => setMethod('phone')} sx={linkSx}>{t('Увійти за номером телефону')}</Typography>
                </>
            ) : (
                <>
                    <ErrorNote>{error}</ErrorNote>

                    <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                        {STEPS.map((label, i) => (
                            <Box key={label} sx={{ flex: 1, textAlign: 'center' }}>
                                <Box sx={{ height: 3, borderRadius: 2, mb: 0.5, bgcolor: i <= login.step ? 'var(--c-accent)' : 'var(--c-border)', transition: 'background 0.3s' }} />
                                <Typography sx={{ fontSize: 10, color: i <= login.step ? 'var(--c-accent)' : 'var(--c-text-faint)', fontWeight: i === login.step ? 700 : 400 }}>{label}</Typography>
                            </Box>
                        ))}
                    </Box>

                    {login.step === 0 && (
                        <>
                            <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 1.5 }}>{t('Введіть з кодом країни (напр. +380…)')}</Typography>
                            <Field autoFocus type="tel" placeholder="+380991234567" value={login.phone}
                                   onChange={e => set({ phone: e.target.value })} onKeyDown={onEnter} />
                        </>
                    )}
                    {login.step === 1 && (
                        <>
                            <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 1.5 }}>{deliveryText(login.delivery)}</Typography>
                            <Field autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="12345" value={login.code}
                                   onChange={e => set({ code: e.target.value })} onKeyDown={onEnter}
                                   style={{ letterSpacing: '0.25em', textAlign: 'center', fontSize: 16 }} />
                            {login.delivery?.next_delivery && (
                                <Typography
                                    onClick={busy ? undefined : resendCode}
                                    sx={{ mt: 1.5, fontSize: 12, textAlign: 'center', color: 'var(--c-accent)', cursor: busy ? 'default' : 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                >
                                    {t('Код не прийшов? ')}{NEXT_TEXT[login.delivery.next_delivery] || t('Надіслати інакше')}
                                </Typography>
                            )}
                        </>
                    )}
                    {login.step === 2 && (
                        <>
                            <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 1.5 }}>{t('Введіть пароль двоетапної перевірки')}</Typography>
                            <Field autoFocus type="password" placeholder={t('Пароль')} value={login.password}
                                   onChange={e => set({ password: e.target.value })} onKeyDown={onEnter} />
                        </>
                    )}

                    <PrimaryButton onClick={submit} busy={busy}>
                        {login.step === 0 ? t('Надіслати код →') : t('Підтвердити →')}
                    </PrimaryButton>
                    {login.step < 2 && (
                        <Typography onClick={() => setMethod('qr')} sx={linkSx}>
                            {login.step === 1 ? t('Код не приходить? Увійти за QR-кодом') : t('Увійти за QR-кодом')}
                        </Typography>
                    )}
                </>
            )}
        </ConnectDialogShell>
    );
}
