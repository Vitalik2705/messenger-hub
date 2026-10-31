import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, Box, Typography, CircularProgress } from '@mui/material';
import { SiWhatsapp } from 'react-icons/si';
import CloseIcon from '@mui/icons-material/Close';
import whatsappService from '../../services/whatsappService';

/**
 * WhatsApp QR-code connect dialog.
 * Self-contained: calls the API internally.
 * Props: { open, onClose, onConnected }
 */
const WhatsAppDialog = ({ open, onClose, onConnected }) => {
    const [step, setStep] = useState('idle'); // idle | loading | qr | connected | failed
    const [sessionId, setSessionId] = useState(null);
    const [qrBase64, setQrBase64] = useState(null);
    const [error, setError] = useState('');
    const pollingRef = useRef(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setStep('idle');
            setSessionId(null);
            setQrBase64(null);
            setError('');
        } else {
            stopPolling();
        }
    }, [open]);

    const stopPolling = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const handleStart = async () => {
        setError('');
        setStep('loading');
        try {
            const result = await whatsappService.initSession();
            const sid = result.sessionId;
            setSessionId(sid);
            // Start polling for QR / connected status
            pollingRef.current = setInterval(() => pollStatus(sid), 3000);
        } catch (e) {
            setError(e.response?.data?.error || 'Не вдалося запустити сесію');
            setStep('failed');
        }
    };

    const pollStatus = async (sid) => {
        try {
            const result = await whatsappService.checkSession(sid);
            if (result.status === 'qr_ready' && result.qrBase64) {
                setQrBase64(result.qrBase64);
                setStep('qr');
            } else if (result.status === 'connected') {
                stopPolling();
                setStep('connected');
                setTimeout(() => {
                    onConnected && onConnected();
                }, 1200);
            } else if (result.status === 'failed') {
                stopPolling();
                setError('Аутентифікацію не вдалось. Спробуйте ще раз.');
                setStep('failed');
            }
        } catch (_) {}
    };

    const handleClose = () => {
        stopPolling();
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: 'var(--c-surface-alt)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--c-border)', boxShadow: '0 20px 60px rgba(26,18,8,0.12)' } }}>
            <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-surface-sunken)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#e8f8ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SiWhatsapp size={18} color="#25D366" />
                    </Box>
                    <Box>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>Підключити WhatsApp</Typography>
                        <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>Скануйте QR-код телефоном</Typography>
                    </Box>
                </Box>
                <CloseIcon onClick={handleClose} sx={{ fontSize: 18, color: 'var(--c-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--c-accent-text)' } }} />
            </Box>

            <DialogContent sx={{ pt: 3, pb: 3 }}>
                {error && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-accent-soft)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-danger)' }}>⚠ {error}</Typography>
                    </Box>
                )}

                {step === 'idle' && (
                    <>
                        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-surface-sunken)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
                            <Typography sx={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                                Натисніть <strong style={{ color: 'var(--c-text)' }}>Отримати QR-код</strong>, щоб розпочати. Потім відскануйте його у WhatsApp:<br />
                                WhatsApp → <strong style={{ color: 'var(--c-text)' }}>Linked Devices</strong> → Link a Device.
                            </Typography>
                        </Box>
                        <Box onClick={handleStart} sx={{ mt: 1, p: 1.3, textAlign: 'center', borderRadius: 2, cursor: 'pointer', background: 'linear-gradient(135deg, #25D366, #128C7E)', '&:hover': { opacity: 0.9 }, transition: 'all 0.2s' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-on-accent)' }}>Отримати QR-код</Typography>
                        </Box>
                    </>
                )}

                {(step === 'loading') && (
                    <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <CircularProgress size={36} sx={{ color: '#25D366' }} />
                        <Typography sx={{ fontSize: 13, color: 'var(--c-text-faint)' }}>Запуск сесії, зачекайте…</Typography>
                    </Box>
                )}

                {step === 'qr' && qrBase64 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ p: 1.5, bgcolor: 'var(--c-surface)', borderRadius: 2, border: '1px solid var(--c-border)' }}>
                            <img src={qrBase64} alt="WhatsApp QR" style={{ width: 220, height: 220, display: 'block' }} />
                        </Box>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', textAlign: 'center' }}>
                            Відкрийте WhatsApp → Linked Devices → Link a Device → відскануйте QR
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={14} sx={{ color: '#25D366' }} />
                            <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>Очікування сканування…</Typography>
                        </Box>
                    </Box>
                )}

                {step === 'connected' && (
                    <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <Typography sx={{ fontSize: 32 }}>✅</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#25D366' }}>WhatsApp підключено!</Typography>
                    </Box>
                )}

                {step === 'failed' && (
                    <Box onClick={handleStart} sx={{ mt: 1, p: 1.3, textAlign: 'center', borderRadius: 2, cursor: 'pointer', background: 'linear-gradient(135deg, #25D366, #128C7E)', '&:hover': { opacity: 0.9 }, transition: 'all 0.2s' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-on-accent)' }}>Спробувати знову</Typography>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default WhatsAppDialog;
