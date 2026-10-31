import { Dialog, DialogContent, Box, Typography } from '@mui/material';
import TelegramIcon from '@mui/icons-material/Telegram';
import CloseIcon from '@mui/icons-material/Close';

const inp = {
    width: '100%', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '10px 14px', color: 'var(--c-text)', fontSize: 13.5,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border 0.15s',
};

const TelegramDialog = ({ open, onClose, step, phone, code, password, error, loading, onPhoneChange, onCodeChange, onPasswordChange, onSendCode, onSignIn, onSignInPassword }) => (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: 'var(--c-surface-alt)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--c-border)', boxShadow: '0 20px 60px rgba(26,18,8,0.12)' } }}>
        <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-surface-sunken)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#e8f4fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TelegramIcon sx={{ fontSize: 18, color: '#0088cc' }} />
                </Box>
                <Box>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>Підключити Telegram</Typography>
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>Увійдіть за номером телефону</Typography>
                </Box>
            </Box>
            <CloseIcon onClick={onClose} sx={{ fontSize: 18, color: 'var(--c-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--c-accent-text)' } }} />
        </Box>

        <DialogContent sx={{ pt: 3, pb: 3 }}>
            {error && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-accent-soft)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-danger)' }}>⚠ {error}</Typography>
                </Box>
            )}

            {/* Крок */}
            <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                {['Телефон', 'Код', '2FA'].map((label, i) => (
                    <Box key={i} sx={{ flex: 1, textAlign: 'center' }}>
                        <Box sx={{ height: 3, borderRadius: 2, mb: 0.5, bgcolor: i <= step ? 'var(--c-accent)' : 'var(--c-border)', transition: 'background 0.3s' }} />
                        <Typography sx={{ fontSize: 10, color: i <= step ? 'var(--c-accent)' : 'var(--c-text-faint)', fontWeight: i === step ? 700 : 400 }}>{label}</Typography>
                    </Box>
                ))}
            </Box>

            {step === 0 && (
                <>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 1.5 }}>Введіть з кодом країни (напр. +380...)</Typography>
                    <input autoFocus placeholder="+380991234567" value={phone} onChange={e => onPhoneChange(e.target.value)} onKeyPress={e => e.key === 'Enter' && onSendCode()} style={inp} />
                </>
            )}
            {step === 1 && (
                <>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 1.5 }}>Перевірте додаток Telegram — там є код</Typography>
                    <input autoFocus placeholder="12345" value={code} onChange={e => onCodeChange(e.target.value)} onKeyPress={e => e.key === 'Enter' && onSignIn()} style={{ ...inp, letterSpacing: '0.25em', textAlign: 'center', fontSize: 16 }} />
                </>
            )}
            {step === 2 && (
                <>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 1.5 }}>Введіть пароль двоетапної перевірки</Typography>
                    <input autoFocus type="password" placeholder="Пароль" value={password} onChange={e => onPasswordChange(e.target.value)} onKeyPress={e => e.key === 'Enter' && onSignInPassword()} style={inp} />
                </>
            )}

            <Box
                onClick={loading ? undefined : (step === 0 ? onSendCode : step === 1 ? onSignIn : onSignInPassword)}
                sx={{
                    mt: 2.5, p: 1.3, textAlign: 'center', borderRadius: 2, cursor: loading ? 'default' : 'pointer',
                    background: loading ? 'var(--c-surface-sunken)' : 'linear-gradient(135deg, var(--c-accent), #f4855a)',
                    color: loading ? 'var(--c-text-faint)' : 'var(--c-surface)', fontSize: 14, fontWeight: 600,
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(232,71,10,0.3)',
                    transition: 'all 0.15s', '&:hover': { opacity: loading ? 1 : 0.92 },
                }}
            >
                {loading ? 'Будь ласка, зачекайте...' : step === 0 ? 'Надіслати код →' : step === 1 ? 'Підтвердити →' : 'Підтвердити →'}
            </Box>
        </DialogContent>
    </Dialog>
);

export default TelegramDialog;