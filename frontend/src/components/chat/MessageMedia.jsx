import { Box, Typography, CircularProgress } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import VoiceMessage from './VoiceMessage';
import { FILE_COLORS, radius } from '../../theme/tokens';
import { formatBytes, formatDuration } from '../../utils/format';
import { t } from '../../i18n';

const MAX_W = 300;
const MAX_H = 340;
const MIN_SIDE = 120;
/** The Telegram service does not fetch media above this size; waiting for it is pointless. */
const FETCH_LIMIT = 5 * 1024 * 1024;

/**
 * The frame a picture will occupy, known from the dimensions Telegram sends with the message, so
 * loading photos do not shift the conversation.
 */
function frameOf(message) {
    const w = message.mediaWidth;
    const h = message.mediaHeight;
    if (!w || !h) return { width: 240, height: 180 };
    const scale = Math.min(MAX_W / w, MAX_H / h, 1);
    return {
        width: Math.max(MIN_SIDE, Math.round(w * scale)),
        height: Math.max(MIN_SIDE * 0.6, Math.round(h * scale)),
    };
}

/** Placeholder while the bytes are on their way: a soft sweep, not a spinner. */
function Shimmer({ width, height, children }) {
    return (
        <Box sx={(t) => ({
            width, height, maxWidth: '100%', position: 'relative', overflow: 'hidden',
            borderRadius: radius.md, bgcolor: t.c.surfaceSunken,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            '&::after': {
                content: '""', position: 'absolute', inset: 0,
                background: `linear-gradient(100deg, transparent 20%, ${t.c.surfaceHover} 50%, transparent 80%)`,
                animation: 'mediaShimmer 1.3s ease-in-out infinite',
            },
            '@keyframes mediaShimmer': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        })}>
            {children}
        </Box>
    );
}

/** The time, laid over a picture the way every messenger does it. */
function Overlay({ children }) {
    if (!children) return null;
    return (
        <Box sx={{
            position: 'absolute', right: 6, bottom: 6,
            display: 'flex', alignItems: 'center', gap: 0.4,
            px: 0.75, py: 0.2, borderRadius: radius.pill,
            bgcolor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(4px)',
            color: '#fff', '& *': { color: '#fff !important' },
        }}>
            {children}
        </Box>
    );
}

function fileKind(name = '', mime = '') {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf' || mime.includes('pdf')) return ['pdf', 'PDF'];
    if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return ['doc', ext.toUpperCase()];
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return ['sheet', ext.toUpperCase()];
    if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return ['slides', ext.toUpperCase()];
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return ['archive', ext.toUpperCase()];
    if (mime.startsWith('image/')) return ['image', ext.toUpperCase() || 'IMG'];
    if (mime.startsWith('audio/')) return ['audio', ext.toUpperCase() || 'AUD'];
    if (mime.startsWith('video/')) return ['video', ext.toUpperCase() || 'VID'];
    return ['other', ext ? ext.toUpperCase().slice(0, 4) : 'FILE'];
}

/**
 * @param overlay  the time and read mark, drawn on the picture when the message is only a
 *                 picture — the bubble then has no footer of its own
 */
const MessageMedia = ({ message, chat, onOpen, transcript, overlay }) => {
    if (!message.mediaType) return null;
    const src = message.mediaBase64 ? `data:${message.mediaMime};base64,${message.mediaBase64}` : null;
    const mt = message.text ? 1 : 0;

    switch (message.mediaType) {
        case 'photo': {
            const frame = frameOf(message);
            if (!src) return <Box sx={{ mt }}><Shimmer {...frame} /></Box>;
            return (
                <Box
                    onClick={() => onOpen?.(message)}
                    sx={{
                        mt, position: 'relative', cursor: 'zoom-in',
                        width: frame.width, maxWidth: '100%',
                        borderRadius: radius.md, overflow: 'hidden',
                        '& img': { transition: 'transform .25s ease, filter .15s' },
                        '&:hover img': { transform: 'scale(1.02)', filter: 'brightness(0.95)' },
                    }}
                >
                    <img src={src} alt={t('фото')}
                         style={{ width: '100%', height: frame.height, objectFit: 'cover', display: 'block' }} />
                    <Overlay>{overlay}</Overlay>
                </Box>
            );
        }

        // Voice notes get their own component: the browser's default player is a grey
        // slab that looks different in every browser.
        case 'audio': return (
            <Box sx={{ mt }}>
                <VoiceMessage message={message} chat={chat} src={src} transcript={transcript} />
            </Box>
        );

        case 'video': {
            const frame = frameOf(message);
            if (!src) {
                return (
                    <Box sx={{ mt, position: 'relative' }}>
                        <Shimmer {...frame}>
                            <Box sx={{
                                zIndex: 1, width: 44, height: 44, borderRadius: '50%',
                                bgcolor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <PlayArrowRoundedIcon sx={{ color: '#fff', fontSize: 28 }} />
                            </Box>
                        </Shimmer>
                        {message.duration ? (
                            <Box sx={{ position: 'absolute', left: 6, top: 6, px: 0.75, borderRadius: radius.pill, bgcolor: 'rgba(0,0,0,0.45)' }}>
                                <Typography sx={{ fontSize: 10.5, color: '#fff', fontWeight: 600 }}>
                                    {formatDuration(message.duration)}
                                </Typography>
                            </Box>
                        ) : null}
                    </Box>
                );
            }
            return (
                <Box sx={{ mt, position: 'relative', width: frame.width, maxWidth: '100%', borderRadius: radius.md, overflow: 'hidden' }}>
                    <video controls preload="metadata"
                           style={{ width: '100%', height: frame.height, objectFit: 'cover', display: 'block', background: '#000' }}>
                        <source src={src} type={message.mediaMime} />
                    </video>
                </Box>
            );
        }

        // Sized by its own proportions, not forced into a square.
        case 'sticker': return src
            ? <Box sx={{ mt, display: 'block' }}>
                <img src={src} alt={t('стікер')}
                     style={{ maxWidth: 150, maxHeight: 150, display: 'block', objectFit: 'contain' }} />
              </Box>
            : <Box sx={{ mt }}><Shimmer width={120} height={120} /></Box>;

        case 'file': {
            const [kind, label] = fileKind(message.fileName || '', message.mediaMime || '');
            const color = FILE_COLORS[kind];
            const size = formatBytes(message.fileSize);
            const tooBig = !src && message.fileSize > FETCH_LIMIT;
            return (
                <Box
                    onClick={() => {
                        if (!src) return;
                        const a = document.createElement('a');
                        a.href = src;
                        a.download = message.fileName || t('файл');
                        a.click();
                    }}
                    sx={(t) => ({
                        display: 'flex', alignItems: 'center', gap: 1.25, mt,
                        p: '8px 12px 8px 8px', minWidth: 220, maxWidth: 320,
                        bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: radius.md,
                        cursor: src ? 'pointer' : 'default', transition: 'border-color .15s, box-shadow .15s',
                        '&:hover': src ? { borderColor: t.c.borderStrong, boxShadow: t.c.shadow } : {},
                        '&:hover .file-dl': { opacity: 1 },
                    })}
                >
                    <Box sx={{
                        width: 38, height: 44, borderRadius: '6px', flexShrink: 0,
                        bgcolor: color, color: '#fff', position: 'relative',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pb: 0.6,
                        // A folded corner: reads as "document" before the label is read.
                        clipPath: 'polygon(0 0, 70% 0, 100% 22%, 100% 100%, 0 100%)',
                    }}>
                        <Typography sx={{ fontSize: label.length > 3 ? 8.5 : 10, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
                            {label}
                        </Typography>
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography noWrap sx={(t) => ({ fontSize: 13, fontWeight: 650, color: t.c.text })}>
                            {message.fileName || t('Файл')}
                        </Typography>
                        <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint })}>
                            {[size, src ? t('натисніть, щоб завантажити') : tooBig ? t('відкрийте в Telegram') : t('завантаження…')].filter(Boolean).join(' · ')}
                        </Typography>
                    </Box>
                    {src
                        ? <DownloadRoundedIcon className="file-dl" sx={(t) => ({ fontSize: 18, color: t.c.textFaint, opacity: 0.6, transition: 'opacity .15s' })} />
                        : tooBig ? null : <CircularProgress size={14} />}
                </Box>
            );
        }

        default: return null;
    }
};

export default MessageMedia;
