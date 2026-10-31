import { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { SiWhatsapp } from 'react-icons/si';
import ConnectDialogShell, { ErrorNote, PrimaryButton } from './ConnectDialogShell';
import whatsappService from '../../services/whatsappService';
import { t } from '../../i18n';

const GREEN = '#25D366';
const GRADIENT = 'linear-gradient(135deg, #25D366, #128C7E)';
const strong = (text) => <strong style={{ color: 'var(--c-text)' }}>{text}</strong>;

/**
 * The pairing itself: start a session, show its QR code, wait for the phone to scan it.
 *
 * Mounted only while the dialog is open, so every opening starts from a clean slate and
 * closing the dialog stops the polling with it — no reset effect to keep in step.
 */
function WhatsAppPairing({ onConnected }) {
    const [step, setStep] = useState('idle'); // idle | loading | qr | connected | failed
    const [qrBase64, setQrBase64] = useState(null);
    const [error, setError] = useState('');
    const pollingRef = useRef(null);

    const stopPolling = () => {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
    useEffect(() => stopPolling, []);

    const pollStatus = async (sessionId) => {
        try {
            const result = await whatsappService.checkSession(sessionId);
            if (result.status === 'qr_ready' && result.qrBase64) {
                setQrBase64(result.qrBase64);
                setStep('qr');
            } else if (result.status === 'connected') {
                stopPolling();
                setStep('connected');
                setTimeout(onConnected, 1200);
            } else if (result.status === 'failed') {
                stopPolling();
                setError(t('Не вдалося підключитися. Спробуйте ще раз.'));
                setStep('failed');
            }
        } catch { /* the node may be restarting; the next tick asks again */ }
    };

    const start = async () => {
        setError('');
        setStep('loading');
        try {
            const { sessionId } = await whatsappService.initSession();
            stopPolling();
            pollingRef.current = setInterval(() => pollStatus(sessionId), 3000);
        } catch (e) {
            setError(t(e.response?.data?.error) || t('Не вдалося запустити сесію'));
            setStep('failed');
        }
    };

    return (
        <>
            <ErrorNote>{error}</ErrorNote>

            {step === 'idle' && (
                <>
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-surface-sunken)', borderRadius: 2 }}>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                            {t('Натисніть ')}{strong(t('Отримати QR-код'))}{t(', потім відскануйте його у WhatsApp:')}
                            {' '}{strong(t('Пов’язані пристрої'))}{t(' → Прив’язати пристрій.')}
                        </Typography>
                    </Box>
                    <PrimaryButton onClick={start} gradient={GRADIENT}>{t('Отримати QR-код')}</PrimaryButton>
                </>
            )}

            {step === 'loading' && (
                <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <CircularProgress size={36} sx={{ color: GREEN }} />
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text-faint)' }}>{t('Запуск сесії, зачекайте…')}</Typography>
                </Box>
            )}

            {step === 'qr' && qrBase64 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2, border: '1px solid var(--c-border)' }}>
                        <img src={qrBase64} alt={t('QR-код WhatsApp')} style={{ width: 220, height: 220, display: 'block' }} />
                    </Box>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', textAlign: 'center' }}>
                        {t('WhatsApp → Пов’язані пристрої → Прив’язати пристрій → відскануйте код')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={14} sx={{ color: GREEN }} />
                        <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{t('Очікування сканування…')}</Typography>
                    </Box>
                </Box>
            )}

            {step === 'connected' && (
                <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontSize: 32 }}>✅</Typography>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: GREEN }}>{t('WhatsApp підключено!')}</Typography>
                </Box>
            )}

            {step === 'failed' && <PrimaryButton onClick={start} gradient={GRADIENT}>{t('Спробувати знову')}</PrimaryButton>}
        </>
    );
}

export default function WhatsAppDialog({ open, onClose, onConnected }) {
    return (
        <ConnectDialogShell open={open} onClose={onClose}
                            icon={<SiWhatsapp size={18} color={GREEN} />} iconBg="#e8f8ee"
                            title={t('Підключити WhatsApp')} subtitle={t('Скануйте QR-код телефоном')}>
            {open && <WhatsAppPairing onConnected={onConnected} />}
        </ConnectDialogShell>
    );
}
