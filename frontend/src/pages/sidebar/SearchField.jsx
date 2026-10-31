import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { radius } from '../../theme/tokens';

/**
 * Search over chat names and archived history.
 *
 * Reachable from the keyboard with `/`, and Escape clears it — the box was previously
 * mouse-only, which is the wrong trade for the control people use most.
 */
export default function SearchField({ value, onChange }) {
    const inputRef = useRef(null);

    useEffect(() => {
        const onKeyDown = (event) => {
            const typingElsewhere = /^(INPUT|TEXTAREA)$/.test(event.target.tagName)
                || event.target.isContentEditable;
            if (event.key === '/' && !typingElsewhere) {
                event.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <Box sx={(t) => ({
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.25, py: 0.85,
            borderRadius: radius.md,
            bgcolor: t.c.surfaceSunken,
            border: `1px solid transparent`,
            transition: 'all .12s',
            '&:focus-within': { borderColor: t.c.borderStrong, bgcolor: t.c.surface },
        })}>
            <SearchIcon sx={(t) => ({ fontSize: 16, color: t.c.textFaint, flexShrink: 0 })} />

            <Box
                component="input"
                ref={inputRef}
                placeholder="Пошук у чатах та історії"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') { onChange(''); e.currentTarget.blur(); }
                }}
                sx={(t) => ({
                    flex: 1, minWidth: 0,
                    background: 'none', border: 'none', outline: 'none',
                    color: t.c.text, fontSize: 13, fontFamily: 'inherit',
                    '&::placeholder': { color: t.c.textFaint },
                })}
            />

            {value ? (
                <CloseIcon
                    onClick={() => onChange('')}
                    sx={(t) => ({
                        fontSize: 15, color: t.c.textFaint, cursor: 'pointer', flexShrink: 0,
                        '&:hover': { color: t.c.text },
                    })}
                />
            ) : (
                <Typography sx={(t) => ({
                    flexShrink: 0,
                    fontSize: 10.5, fontWeight: 700, color: t.c.textFaint,
                    border: `1px solid ${t.c.border}`, borderRadius: radius.sm,
                    px: 0.6, lineHeight: 1.5,
                })}>
                    /
                </Typography>
            )}
        </Box>
    );
}
