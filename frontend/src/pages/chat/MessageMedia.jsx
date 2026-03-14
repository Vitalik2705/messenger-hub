import { Box, Typography } from '@mui/material';

const fmt = s => { if (!s) return '0:00'; return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; };

const Pill = ({ icon, label }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '8px 12px', bgcolor: '#f5f0eb', border: '1px solid #e4ddd4', borderRadius: 2, minWidth: 160 }}>
        <Typography sx={{ fontSize: 16 }}>{icon}</Typography>
        <Typography sx={{ fontSize: 12, color: '#9a8878', fontFamily: '"DM Sans", sans-serif' }}>{label}</Typography>
    </Box>
);

const MessageMedia = ({ message }) => {
    if (!message.mediaType) return null;
    const src = message.mediaBase64 ? `data:${message.mediaMime};base64,${message.mediaBase64}` : null;
    const mt = message.text ? 1 : 0;

    switch (message.mediaType) {
        case 'photo': return src ? (
            <Box sx={{ mt, borderRadius: 2, overflow: 'hidden', display: 'inline-block', cursor: 'zoom-in' }} onClick={() => window.open(src)}>
                <img src={src} alt="photo" style={{ maxWidth: 280, maxHeight: 320, display: 'block', borderRadius: 8 }} />
            </Box>
        ) : <Pill icon="🖼️" label="Loading photo..." />;

        case 'audio': return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt, p: '10px 14px', bgcolor: '#f5f0eb', border: '1px solid #e4ddd4', borderRadius: 2.5, minWidth: 200 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#fde8e0', border: '1px solid #f4c0a8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Typography sx={{ fontSize: 14 }}>🎵</Typography></Box>
                {src ? <audio controls style={{ height: 28, flex: 1 }}><source src={src} type={message.mediaMime} /></audio>
                    : <Box><Typography sx={{ fontSize: 12, color: '#5c4a38', fontWeight: 500, fontFamily: '"DM Sans", sans-serif' }}>Voice message</Typography><Typography sx={{ fontSize: 10, color: '#b0a090' }}>{message.duration ? fmt(message.duration) : 'Loading...'}</Typography></Box>}
            </Box>
        );

        case 'video': return src ? (
            <Box sx={{ mt, borderRadius: 2, overflow: 'hidden' }}>
                <video controls style={{ maxWidth: 280, maxHeight: 280, display: 'block', borderRadius: 8 }}><source src={src} type={message.mediaMime} /></video>
            </Box>
        ) : <Pill icon="🎬" label={message.duration ? `Video · ${fmt(message.duration)}` : 'Loading video...'} />;

        case 'sticker': return src ? <Box sx={{ mt }}><img src={src} alt="sticker" style={{ width: 120, height: 120 }} /></Box> : <Typography sx={{ fontSize: 40 }}>🎭</Typography>;

        case 'file': return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt, p: '10px 14px', bgcolor: '#f5f0eb', border: '1px solid #e4ddd4', borderRadius: 2.5, minWidth: 200, cursor: src ? 'pointer' : 'default', transition: 'all 0.15s', '&:hover': src ? { bgcolor: '#f0ebe3', borderColor: '#d4c9bc' } : {} }}
                onClick={() => { if (!src) return; const a = document.createElement('a'); a.href = src; a.download = message.fileName || 'file'; a.click(); }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: '#e8f4fb', border: '1px solid #b8dcf0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Typography sx={{ fontSize: 14 }}>📎</Typography></Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1a1208', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }}>{message.fileName || 'File'}</Typography>
                    <Typography sx={{ fontSize: 10, color: '#b0a090', fontFamily: '"DM Sans", sans-serif' }}>{src ? 'Click to download' : 'Loading...'}</Typography>
                </Box>
            </Box>
        );

        default: return null;
    }
};

export default MessageMedia;