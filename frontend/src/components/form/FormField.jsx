import { useState, useId } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { radius } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * A labelled input in the app's own style: label above, message below, the accent ring on
 * focus and the danger colour on error. Password fields get a show/hide toggle and a Caps
 * Lock warning — the two things that cause most "wrong password" errors.
 */
export default function FormField({ label, error, hint, type = 'text', endSlot, ...inputProps }) {
    const id = useId();
    const [shown, setShown] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const isPassword = type === 'password';
    const trackCaps = (e) => setCapsLock(Boolean(e.getModifierState?.('CapsLock')));
    const message = error || (isPassword && capsLock ? t('Увімкнено Caps Lock') : hint);

    return (
        <Box sx={{ mb: 2 }}>
            {label && (
                <Typography component="label" htmlFor={id}
                            sx={(t) => ({ display: 'block', fontSize: 12.5, fontWeight: 650, color: t.c.text, mb: 0.75 })}>
                    {label}
                </Typography>
            )}
            <Box sx={(t) => ({
                display: 'flex', alignItems: 'center',
                bgcolor: t.c.surface, borderRadius: radius.md,
                border: `1px solid ${error ? t.c.danger : t.c.border}`,
                transition: 'border-color .15s, box-shadow .15s',
                '&:focus-within': {
                    borderColor: error ? t.c.danger : t.c.accent,
                    boxShadow: `0 0 0 3px ${error ? 'rgba(200, 52, 31, 0.12)' : t.c.accentSoft}`,
                },
            })}>
                <Box
                    component="input"
                    id={id}
                    type={isPassword && shown ? 'text' : type}
                    aria-invalid={Boolean(error)}
                    onKeyUp={isPassword ? trackCaps : undefined}
                    onKeyDown={isPassword ? trackCaps : undefined}
                    {...inputProps}
                    sx={(t) => ({
                        flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none',
                        px: 1.5, py: 1.35, fontSize: 14.5, fontFamily: 'inherit', color: t.c.text,
                        '&::placeholder': { color: t.c.textFaint },
                        '&:disabled': { color: t.c.textFaint },
                    })}
                />
                {isPassword && (
                    <IconButton size="small" tabIndex={-1} onClick={() => setShown(s => !s)}
                                aria-label={shown ? t('Сховати пароль') : t('Показати пароль')} sx={{ mr: 0.5 }}>
                        {shown ? <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                )}
                {endSlot}
            </Box>
            {message && (
                <Typography sx={(t) => ({ fontSize: 12, mt: 0.6, color: error ? t.c.danger : t.c.textFaint })}>
                    {message}
                </Typography>
            )}
        </Box>
    );
}
