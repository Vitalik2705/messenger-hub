import { Dialog, DialogContent, Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TelegramIcon from '@mui/icons-material/Telegram';
import { SiSlack, SiDiscord, SiWhatsapp, SiViber } from 'react-icons/si';

const messengers = [
    {
        key: 'TELEGRAM',
        label: 'Telegram',
        sub: 'Особистий акаунт',
        icon: <TelegramIcon sx={{ fontSize: 28, color: '#0088cc' }} />,
        bg: '#e8f4fb',
        border: '#b8dcf0',
        color: '#0070aa',
    },
    {
        key: 'SLACK',
        label: 'Slack',
        sub: 'User OAuth токен',
        icon: <SiSlack size={26} color="#611f69" />,
        bg: '#f5eef6',
        border: '#dfc0e0',
        color: '#611f69',
    },
    {
        key: 'DISCORD',
        label: 'Discord',
        sub: 'Токен бота',
        icon: <SiDiscord size={26} color="#5865F2" />,
        bg: '#eef0fb',
        border: '#c5caee',
        color: '#3a45a8',
    },
    {
        key: 'WHATSAPP',
        label: 'WhatsApp',
        sub: 'Сканування QR-коду',
        icon: <SiWhatsapp size={26} color="#25D366" />,
        bg: '#e8f8ee',
        border: '#a8e0be',
        color: '#1a7a42',
    },
    {
        key: 'VIBER',
        label: 'Viber',
        sub: 'Токен бота',
        icon: <SiViber size={26} color="#7360F2" />,
        bg: '#f0edf8',
        border: '#c5b8f0',
        color: '#4a38b8',
    },
];

const AddAccountDialog = ({ open, onClose, onSelect }) => (
    <Dialog
        open={open}
        onClose={onClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{
            sx: {
                bgcolor: 'var(--c-surface-alt)',
                borderRadius: 3,
                border: '1px solid var(--c-border)',
                boxShadow: '0 20px 60px rgba(26,18,8,0.14)',
            }
        }}
    >
        <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-surface-sunken)' }}>
            <Box>
                <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)' }}>
                    Підключити месенджер
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)', mt: 0.3 }}>
                    Оберіть платформу для підключення
                </Typography>
            </Box>
            <CloseIcon onClick={onClose} sx={{ fontSize: 18, color: 'var(--c-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--c-accent-text)' } }} />
        </Box>

        <DialogContent sx={{ pt: 2.5, pb: 3, px: 2.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                {messengers.map(m => (
                    <Box
                        key={m.key}
                        onClick={() => { onSelect(m.key); onClose(); }}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            p: 1.6,
                            borderRadius: 2.5,
                            border: `1px solid ${m.border}`,
                            bgcolor: m.bg,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            '&:hover': {
                                transform: 'translateX(4px)',
                                boxShadow: `0 4px 14px rgba(0,0,0,0.08)`,
                                borderColor: m.color,
                            },
                        }}
                    >
                        <Box sx={{ width: 46, height: 46, borderRadius: 2, bgcolor: 'var(--c-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                            {m.icon}
                        </Box>
                        <Box>
                            <Typography sx={{ fontSize: 14, fontWeight: 700, color: m.color, lineHeight: 1.2 }}>
                                {m.label}
                            </Typography>
                            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-faint)', mt: 0.2 }}>
                                {m.sub}
                            </Typography>
                        </Box>
                        <Box sx={{ ml: 'auto', color: 'var(--c-text-faint)', fontSize: 18 }}>›</Box>
                    </Box>
                ))}
            </Box>
        </DialogContent>
    </Dialog>
);

export default AddAccountDialog;
