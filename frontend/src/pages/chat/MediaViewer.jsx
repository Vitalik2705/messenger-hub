import { useEffect, useCallback } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { formatDayLabel, formatClock } from '../../utils/format';
import { numeric } from '../../theme/tokens';

/**
 * Full-size media, in the app.
 *
 * Clicking a photo used to call `window.open(src)` on a `data:` URI, which browsers have
 * refused to navigate to since 2017 — the click did nothing at all, so a photo could be
 * seen only at thumbnail size. There is nowhere to send the browser anyway: the bytes live
 * in memory as base64 and were never given a URL.
 *
 * Every photo in the open conversation is navigable from here, because having opened one
 * the next thing anyone wants is the one before it.
 */
export default function MediaViewer({ items, index, onClose, onIndex }) {
    const item = items[index];

    const step = useCallback((delta) => {
        const next = index + delta;
        if (next >= 0 && next < items.length) onIndex(next);
    }, [index, items.length, onIndex]);

    useEffect(() => {
        const onKey = (event) => {
            if (event.key === 'Escape') onClose();
            else if (event.key === 'ArrowLeft') step(-1);
            else if (event.key === 'ArrowRight') step(1);
        };
        window.addEventListener('keydown', onKey);
        // The page behind must not scroll while a full-screen layer is up.
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [onClose, step]);

    if (!item) return null;

    return (
        <Box
            onClick={onClose}
            sx={{
                position: 'fixed', inset: 0, zIndex: 1400,
                display: 'flex', flexDirection: 'column',
                bgcolor: 'rgba(8, 9, 11, 0.92)',
                backdropFilter: 'blur(2px)',
            }}
        >
            <Box
                onClick={(e) => e.stopPropagation()}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    px: 2.5, py: 1.5, flexShrink: 0,
                    color: 'rgba(255,255,255,0.85)',
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 13, fontWeight: 650, color: '#fff' }}>
                        {item.senderName}
                    </Typography>
                    <Typography sx={{ ...numeric, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                        {[formatDayLabel(item.timestamp), formatClock(item.timestamp)]
                            .filter(Boolean).join(', ')}
                        {items.length > 1 && ` · ${index + 1} з ${items.length}`}
                    </Typography>
                </Box>

                {/* An <a download> works where window.open does not: it never navigates,
                    it hands the bytes to the browser's download machinery directly. */}
                <IconButton
                    component="a"
                    href={item.src}
                    download={item.fileName || 'photo.jpg'}
                    size="small"
                    title="Зберегти"
                    sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff' } }}
                >
                    <DownloadIcon sx={{ fontSize: 19 }} />
                </IconButton>

                <IconButton
                    size="small" onClick={onClose} title="Закрити — Esc"
                    sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff' } }}
                >
                    <CloseIcon sx={{ fontSize: 20 }} />
                </IconButton>
            </Box>

            <Box sx={{
                flex: 1, minHeight: 0, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                px: { xs: 1, sm: 7 }, pb: 3,
            }}>
                {index > 0 && (
                    <Arrow side="left" onClick={(e) => { e.stopPropagation(); step(-1); }}>
                        <ChevronLeftIcon sx={{ fontSize: 26 }} />
                    </Arrow>
                )}

                <Box
                    component="img"
                    src={item.src}
                    alt=""
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                        maxWidth: '100%', maxHeight: '100%',
                        objectFit: 'contain',
                        borderRadius: '4px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}
                />

                {index < items.length - 1 && (
                    <Arrow side="right" onClick={(e) => { e.stopPropagation(); step(1); }}>
                        <ChevronRightIcon sx={{ fontSize: 26 }} />
                    </Arrow>
                )}
            </Box>
        </Box>
    );
}

function Arrow({ side, onClick, children }) {
    return (
        <IconButton
            onClick={onClick}
            sx={{
                position: 'absolute', [side]: 8, top: '50%', transform: 'translateY(-50%)',
                width: 42, height: 42,
                color: 'rgba(255,255,255,0.75)',
                bgcolor: 'rgba(255,255,255,0.08)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.16)', color: '#fff' },
            }}
        >
            {children}
        </IconButton>
    );
}
