import { Dialog, DialogContent, Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { SiDiscord } from 'react-icons/si';

const inp = {
    width: '100%', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '10px 14px', color: 'var(--c-text)', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
};

const DiscordDialog = ({ open, onClose, token, onTokenChange, onConnect, loading, error }) => (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: 'var(--c-surface-alt)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--c-border)', boxShadow: '0 20px 60px rgba(26,18,8,0.12)' } }}>
        <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-surface-sunken)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#eef0fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SiDiscord size={18} color="#5865F2" />
                </Box>
                <Box>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>Підключити Discord</Typography>
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
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
                    1. Перейдіть на <strong style={{ color: 'var(--c-text)' }}>discord.com/developers/applications</strong><br />
                    2. Створіть додаток → Bot → <strong style={{ color: 'var(--c-text)' }}>Reset Token</strong><br />
                    3. Увімкніть <strong style={{ color: 'var(--c-text)' }}>Message Content Intent</strong> у налаштуваннях бота<br />
                    4. Запросіть бота на сервери з правом <strong style={{ color: 'var(--c-text)' }}>Read Messages</strong><br />
                    5. Вставте токен бота нижче
                </Typography>
            </Box>
            <input
                autoFocus
                placeholder="Токен бота..."
                value={token}
                onChange={e => onTokenChange(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && !loading && onConnect()}
                style={inp}
            />
            <Box
                onClick={loading || !token ? undefined : onConnect}
                sx={{
                    mt: 2.5, p: 1.3, textAlign: 'center', borderRadius: 2,
                    cursor: loading || !token ? 'default' : 'pointer',
                    background: loading || !token ? 'var(--c-surface-sunken)' : 'linear-gradient(135deg, #5865F2, #7289da)',
                    color: loading || !token ? 'var(--c-text-faint)' : 'var(--c-surface)',
                    fontSize: 14, fontWeight: 600,
                    boxShadow: !loading && token ? '0 4px 14px rgba(88,101,242,0.3)' : 'none',
                    transition: 'all 0.15s',
                }}
            >
                {loading ? 'Підключення...' : 'Підключити Discord →'}
            </Box>
        </DialogContent>
    </Dialog>
);

export default DiscordDialog;
