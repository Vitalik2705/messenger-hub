import { Box, Typography } from '@mui/material';
import { radius } from '../../theme/tokens';

/** One block of the settings page: a title, a line on what it is for, then its controls. */
export default function SettingsCard({ title, description, children, danger = false, id }) {
    return (
        <Box id={id} component="section" sx={(t) => ({
            bgcolor: t.c.surface, borderRadius: radius.xl, p: { xs: 2.5, sm: 3 }, mb: 2.5,
            border: `1px solid ${danger ? `${t.c.danger}55` : t.c.border}`, boxShadow: t.c.shadow,
            scrollMarginTop: 80,
        })}>
            <Typography component="h2" sx={(t) => ({ fontSize: 16, fontWeight: 750, color: danger ? t.c.danger : t.c.text, letterSpacing: '-0.01em' })}>
                {title}
            </Typography>
            {description && (
                <Typography sx={(t) => ({ fontSize: 13, color: t.c.textMuted, mt: 0.5, mb: 2.5, lineHeight: 1.5 })}>
                    {description}
                </Typography>
            )}
            {children}
        </Box>
    );
}

/** A label and its control on one line, the label's explanation under it. */
export function SettingRow({ title, hint, children, first = false }) {
    return (
        <Box sx={(t) => ({
            display: 'flex', alignItems: 'center', gap: 2, py: 1.5,
            borderTop: first ? 'none' : `1px solid ${t.c.border}`,
        })}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={(t) => ({ fontSize: 14, fontWeight: 600, color: t.c.text })}>{title}</Typography>
                {hint && <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textFaint, mt: 0.25, lineHeight: 1.45 })}>{hint}</Typography>}
            </Box>
            {children}
        </Box>
    );
}
