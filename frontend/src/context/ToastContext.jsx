import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import CloseIcon from '@mui/icons-material/Close';

const ToastContext = createContext({ toast: () => {} });

const ICONS = {
    success: <CheckCircleRoundedIcon sx={(t) => ({ fontSize: 18, color: t.c.success })} />,
    error: <ErrorRoundedIcon sx={(t) => ({ fontSize: 18, color: t.c.danger })} />,
    info: <InfoRoundedIcon sx={(t) => ({ fontSize: 18, color: t.c.accentText })} />,
};

let nextId = 1;

/** Short confirmations and errors, shown the same way at the bottom of the screen. */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

    const toast = useCallback((message, type = 'info', ms = 3200) => {
        const id = nextId++;
        setToasts((all) => [...all.slice(-2), { id, message, type }]);
        setTimeout(() => dismiss(id), ms);
    }, [dismiss]);

    const value = useMemo(() => ({ toast }), [toast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <Box sx={{
                position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 2000,
                display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', pointerEvents: 'none',
            }}>
                {toasts.map((t) => (
                    <Box key={t.id} role="status" sx={(theme) => ({
                        pointerEvents: 'auto',
                        display: 'flex', alignItems: 'center', gap: 1.25,
                        pl: 1.5, pr: 0.75, py: 0.75, minWidth: 220, maxWidth: 440,
                        bgcolor: theme.c.surface, border: `1px solid ${theme.c.border}`,
                        borderRadius: '12px', boxShadow: theme.c.shadowRaised,
                        animation: 'toastIn .2s ease-out',
                        '@keyframes toastIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
                    })}>
                        {ICONS[t.type] || ICONS.info}
                        <Typography sx={(theme) => ({ flex: 1, fontSize: 13, color: theme.c.text })}>{t.message}</Typography>
                        <IconButton size="small" onClick={() => dismiss(t.id)} sx={{ width: 24, height: 24 }}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Box>
                ))}
            </Box>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext).toast;
