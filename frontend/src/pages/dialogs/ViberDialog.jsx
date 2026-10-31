import { Dialog, DialogContent, Box, Typography } from '@mui/material';
import { SiViber } from 'react-icons/si';
import CloseIcon from '@mui/icons-material/Close';

const inp = {
    width: '100%', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '10px 14px', color: 'var(--c-text)', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
};

const ViberDialog = ({ open, onClose, token, onTokenChange, onConnect, loading, error }) => (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: 'var(--c-surface-alt)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--c-border)', boxShadow: '0 20px 60px rgba(26,18,8,0.12)' } }}>
        <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-surface-sunken)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#f0edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SiViber size={18} color="#7360F2" />
                </Box>
                <Box>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>Підключити Viber бота</Typography>
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>Вставте токен бота</Typography>
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
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-surface-sunken)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                    Перейдіть на <strong style={{ color: 'var(--c-text)' }}>partners.viber.com</strong> → Create Bot Account → скопійте <strong style={{ color: 'var(--c-text)' }}>Auth Token</strong>. Повідомлення надходитимуть після отримання повідомлень від користувачів. Для локальної роботи відкрийте порт 8205 через ngrok.
                </Typography>
            </Box>
            <input
                autoFocus
                placeholder="Токен авторизації Viber..."
                value={token}
                onChange={e => onTokenChange(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && !loading && token && onConnect()}
                style={inp}
            />
            <Box
                onClick={loading || !token ? undefined : onConnect}
                sx={{
                    mt: 2.5, p: 1.3, textAlign: 'center', borderRadius: 2,
                    cursor: loading || !token ? 'default' : 'pointer',
                    background: loading || !token ? 'var(--c-surface-sunken)' : 'linear-gradient(135deg, #7360F2, #9b88ff)',
                    transition: 'all 0.2s',
                    '&:hover': { opacity: loading || !token ? 1 : 0.9 }
                }}
            >
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: loading || !token ? 'var(--c-text-faint)' : 'var(--c-surface)' }}>
                    {loading ? 'Підключення...' : 'Підключити'}
                </Typography>
            </Box>
        </DialogContent>
    </Dialog>
);

export default ViberDialog;
