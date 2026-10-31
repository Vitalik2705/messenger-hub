import { Dialog, DialogContent, Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { t } from '../../i18n';

/*
 * The frame every "connect a messenger" dialog shares: the network's mark and name on top,
 * an error line, a field style and the primary button. The dialogs differ only in the
 * steps between those.
 */

const inputStyle = {
    width: '100%', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '10px 14px', color: 'var(--c-text)', fontSize: 13.5,
    outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s',
};

/** A plain input in the dialogs' style; `style` adds to it rather than replacing it. */
export function Field({ style, ...props }) {
    return <input {...props} style={{ ...inputStyle, ...style }} />;
}

export function ErrorNote({ children }) {
    if (!children) return null;
    return (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-accent-soft)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
            <Typography sx={{ fontSize: 12, color: 'var(--c-danger)' }}>⚠ {children}</Typography>
        </Box>
    );
}

/** @param gradient  the network's own colours; the app accent when omitted */
export function PrimaryButton({ onClick, disabled, busy, gradient, children }) {
    const off = disabled || busy;
    return (
        <Box
            role="button"
            onClick={off ? undefined : onClick}
            sx={{
                mt: 2.5, p: 1.3, textAlign: 'center', borderRadius: 2, cursor: off ? 'default' : 'pointer',
                background: off ? 'var(--c-surface-sunken)' : (gradient || 'linear-gradient(135deg, var(--c-accent), var(--c-accent-hover))'),
                color: off ? 'var(--c-text-faint)' : '#fff', fontSize: 14, fontWeight: 600,
                boxShadow: off ? 'none' : '0 4px 14px var(--c-accent-soft)',
                transition: 'all 0.15s', '&:hover': { opacity: off ? 1 : 0.92 },
            }}
        >
            {busy ? t('Будь ласка, зачекайте…') : children}
        </Box>
    );
}

export default function ConnectDialogShell({ open, onClose, icon, iconBg, title, subtitle, children }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
                slotProps={{ paper: { sx: (t) => ({ bgcolor: t.c.surfaceAlt, borderRadius: 3, overflow: 'hidden', border: `1px solid ${t.c.border}`, boxShadow: t.c.shadowRaised, backgroundImage: 'none' }) } }}>
            <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-surface-sunken)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {icon}
                    </Box>
                    <Box>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{title}</Typography>
                        {subtitle && <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{subtitle}</Typography>}
                    </Box>
                </Box>
                <CloseIcon onClick={onClose} sx={{ fontSize: 18, color: 'var(--c-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--c-accent-text)' } }} />
            </Box>
            <DialogContent sx={{ pt: 3, pb: 3 }}>{children}</DialogContent>
        </Dialog>
    );
}
