import { Box, Typography } from '@mui/material';
import VoiceMessage from './VoiceMessage';

const fmt = s => { if (!s) return '0:00'; return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; };

const Pill = ({ icon, label }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '8px 12px', bgcolor: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 2, minWidth: 160 }}>
        <Typography sx={{ fontSize: 16 }}>{icon}</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{label}</Typography>
    </Box>
);

const MessageMedia = ({ message, chat, onOpen, transcript }) => {
    if (!message.mediaType) return null;
    const src = message.mediaBase64 ? `data:${message.mediaMime};base64,${message.mediaBase64}` : null;
    const mt = message.text ? 1 : 0;

    switch (message.mediaType) {
        case 'photo': return src ? (
            <Box
                onClick={() => onOpen?.(message)}
                sx={{
                    mt, borderRadius: 2, overflow: 'hidden', display: 'block',
                    cursor: 'zoom-in', position: 'relative',
                    // The thumbnail is a link to the full picture, so it has to look like one.
                    '&:hover img': { filter: 'brightness(0.94)' },
                }}
            >
                <img src={src} alt="фото"
                     style={{ maxWidth: 280, maxHeight: 320, display: 'block', borderRadius: 8,
                              transition: 'filter .12s' }} />
            </Box>
        ) : <Pill icon="🖼️" label="Завантаження фото..." />;

        // Voice notes get their own component: the browser's default player is a grey
        // slab with a download button and a volume slider, and it looks different in every
        // browser — the one element in the conversation nobody had styled.
        case 'audio': return (
            <Box sx={{ mt }}>
                <VoiceMessage message={message} chat={chat} src={src} transcript={transcript} />
            </Box>
        );

        case 'video': return src ? (
            <Box sx={{ mt, borderRadius: 2, overflow: 'hidden' }}>
                <video controls style={{ maxWidth: 280, maxHeight: 280, display: 'block', borderRadius: 8 }}>
                    <source src={src} type={message.mediaMime} />
                </video>
            </Box>
        ) : <Pill icon="🎬" label={message.duration ? `Відео · ${fmt(message.duration)}` : 'Завантаження відео...'} />;

        // Sized by its own proportions, not forced into a square: a wide sticker squeezed
        // into 120×120 is what made these look like a mistake in the middle of a bubble.
        case 'sticker': return src
            ? <Box sx={{ mt, display: 'block' }}>
                <img src={src} alt="стікер"
                     style={{ maxWidth: 140, maxHeight: 140, display: 'block', objectFit: 'contain' }} />
              </Box>
            : <Typography sx={{ fontSize: 40 }}>🎭</Typography>;

        case 'file': return (
            <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt, p: '10px 14px', bgcolor: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 2.5, minWidth: 200, cursor: src ? 'pointer' : 'default', transition: 'all 0.15s', '&:hover': src ? { bgcolor: 'var(--c-surface-sunken)', borderColor: 'var(--c-border-strong)' } : {} }}
                onClick={() => {
                    if (!src) return;
                    const a = document.createElement('a');
                    a.href = src;
                    a.download = message.fileName || 'файл';
                    a.click();
                }}
            >
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: '#e8f4fb', border: '1px solid #b8dcf0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Typography sx={{ fontSize: 14 }}>📎</Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {message.fileName || 'Файл'}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: 'var(--c-text-faint)' }}>
                        {src ? 'Натисніть для завантаження' : 'Завантаження...'}
                    </Typography>
                </Box>
            </Box>
        );

        default: return null;
    }
};

export default MessageMedia;