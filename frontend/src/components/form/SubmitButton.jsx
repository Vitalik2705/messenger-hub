import { Box, CircularProgress } from '@mui/material';
import { radius } from '../../theme/tokens';

/** The one primary action of a form, with its own busy state so it cannot be pressed twice. */
export default function SubmitButton({ busy, disabled, children, busyText, danger = false, ...props }) {
    const off = busy || disabled;
    return (
        <Box
            component="button"
            type="submit"
            disabled={off}
            {...props}
            sx={(t) => {
                const base = danger ? t.c.danger : t.c.accent;
                return {
                    width: '100%', mt: 1, py: 1.4, border: 'none', borderRadius: radius.md,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                    fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700, cursor: off ? 'default' : 'pointer',
                    color: off ? t.c.textFaint : (danger ? '#fff' : t.c.onAccent),
                    background: off ? t.c.surfaceSunken : (danger ? base : `linear-gradient(160deg, ${t.c.accent}, ${t.c.accentHover})`),
                    boxShadow: off ? 'none' : `0 6px 16px ${danger ? 'rgba(200, 52, 31, 0.22)' : t.c.accentSoft}`,
                    transition: 'transform .12s, box-shadow .12s, opacity .12s',
                    '&:hover': off ? {} : { transform: 'translateY(-1px)' },
                    '&:active': off ? {} : { transform: 'none' },
                    '&:focus-visible': { outline: `2px solid ${base}`, outlineOffset: 2 },
                };
            }}
        >
            {busy && <CircularProgress size={16} sx={{ color: 'inherit' }} />}
            {busy ? (busyText || children) : children}
        </Box>
    );
}
