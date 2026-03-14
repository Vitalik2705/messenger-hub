import { Dialog, DialogContent, Box, Typography } from '@mui/material';
import { SiSlack } from 'react-icons/si';
import CloseIcon from '@mui/icons-material/Close';

const inp = {
    width: '100%', background: '#f5f0eb', border: '1px solid #e4ddd4',
    borderRadius: 8, padding: '10px 14px', color: '#1a1208', fontSize: 13,
    outline: 'none', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box',
};

const SlackDialog = ({ open, onClose, token, onTokenChange, onConnect, loading, error }) => (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#faf7f4', borderRadius: 3, overflow: 'hidden', border: '1px solid #ede8e1', boxShadow: '0 20px 60px rgba(26,18,8,0.12)' } }}>
        <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0ebe3' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#f5eef6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SiSlack size={18} color="#611f69" />
                </Box>
                <Box>
                    <Typography sx={{ fontFamily: '"Playfair Display", serif', fontSize: 16, fontWeight: 700, color: '#1a1208' }}>Connect Slack</Typography>
                    <Typography sx={{ fontSize: 11, color: '#b0a090', fontFamily: '"DM Sans", sans-serif' }}>Paste your User OAuth Token</Typography>
                </Box>
            </Box>
            <CloseIcon onClick={onClose} sx={{ fontSize: 18, color: '#c4b5a0', cursor: 'pointer', '&:hover': { color: '#e8470a' } }} />
        </Box>

        <DialogContent sx={{ pt: 3, pb: 3 }}>
            {error && <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fde8e0', border: '1px solid #f4c0a8', borderRadius: 2 }}><Typography sx={{ fontSize: 12, color: '#c0390a', fontFamily: '"DM Sans", sans-serif' }}>⚠ {error}</Typography></Box>}
            <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f0ebe3', border: '1px solid #e4ddd4', borderRadius: 2 }}>
                <Typography sx={{ fontSize: 12, color: '#7a6858', lineHeight: 1.6, fontFamily: '"DM Sans", sans-serif' }}>
                    Go to <strong style={{ color: '#1a1208' }}>api.slack.com/apps</strong> → OAuth & Permissions → copy the <strong style={{ color: '#1a1208' }}>User OAuth Token</strong> (starts with xoxp-)
                </Typography>
            </Box>
            <input autoFocus placeholder="xoxp-..." value={token} onChange={e => onTokenChange(e.target.value)} onKeyPress={e => e.key === 'Enter' && !loading && onConnect()} style={inp} />
            <Box onClick={loading || !token ? undefined : onConnect} sx={{
                mt: 2.5, p: 1.3, textAlign: 'center', borderRadius: 2,
                cursor: loading || !token ? 'default' : 'pointer',
                background: loading || !token ? '#f0ebe3' : 'linear-gradient(135deg, #611f69, #9b59b6)',
                color: loading || !token ? '#b0a090' : 'white',
                fontSize: 14, fontWeight: 600, fontFamily: '"DM Sans", sans-serif',
                boxShadow: !loading && token ? '0 4px 14px rgba(97,31,105,0.3)' : 'none',
                transition: 'all 0.15s',
            }}>
                {loading ? 'Connecting...' : 'Connect Slack →'}
            </Box>
        </DialogContent>
    </Dialog>
);

export default SlackDialog;