import { useEffect, useRef } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import CloseIcon from '@mui/icons-material/Close';
import { radius, numeric } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * Find in this conversation (Ctrl+F) over the loaded messages. Enter goes to the older hit,
 * Shift+Enter to the newer one, Escape closes.
 */
export default function ChatSearchBar({ query, onQuery, count, index, onStep, onClose }) {
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current?.focus(); }, []);

    return (
        <Box sx={(t) => ({
            display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 0.9,
            bgcolor: t.c.surfaceAlt, borderBottom: `1px solid ${t.c.border}`, zIndex: 5,
            animation: 'barIn .15s ease-out',
            '@keyframes barIn': { from: { opacity: 0, transform: 'translateY(-4px)' }, to: { opacity: 1, transform: 'none' } },
        })}>
            <Box sx={(t) => ({
                flex: 1, display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.6,
                bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: radius.md,
                '&:focus-within': { borderColor: t.c.accent },
            })}>
                <SearchIcon sx={(t) => ({ fontSize: 17, color: t.c.textFaint })} />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onClose();
                        else if (e.key === 'Enter') { e.preventDefault(); onStep(e.shiftKey ? 1 : -1); }
                    }}
                    placeholder={t('Пошук у цьому чаті…')}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'none', color: 'inherit', fontSize: 13, fontFamily: 'inherit' }}
                />
                {query.trim().length >= 2 && (
                    <Typography sx={(t) => ({ ...numeric, fontSize: 11.5, color: count ? t.c.textMuted : t.c.danger, whiteSpace: 'nowrap' })}>
                        {count ? t('{0} з {1}', count - index, count) : t('немає збігів')}
                    </Typography>
                )}
            </Box>
            <IconButton size="small" disabled={!count} onClick={() => onStep(-1)} title={t('Попередній (Enter)')}>
                <KeyboardArrowUpRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <IconButton size="small" disabled={!count} onClick={() => onStep(1)} title={t('Наступний (Shift+Enter)')}>
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <IconButton size="small" onClick={onClose} title={t('Закрити (Esc)')}>
                <CloseIcon sx={{ fontSize: 17 }} />
            </IconButton>
        </Box>
    );
}
