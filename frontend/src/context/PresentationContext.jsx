import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { t } from '../i18n';

const STORAGE_KEY = 'presenting';
const PREFIX = { GROUP: t('Група'), CHANNEL: t('Канал'), BOT: t('Бот') };

const PresentationContext = createContext({ presenting: false, setPresenting: () => {}, name: (n) => n });

/**
 * Presentation mode, for showing the app on a projector: names become stable aliases («Контакт 3»),
 * avatars become initials, and message text and model output are blurred until hovered.
 *
 * The blur is a class on <body> plus a `data-private` attribute on private content, styled once in
 * the theme. Ctrl+Shift+H toggles it; the choice survives a reload.
 */
export function PresentationProvider({ children }) {
    const [presenting, setPresenting] = useState(() => localStorage.getItem(STORAGE_KEY) === 'on');
    const aliases = useRef(new Map());

    useEffect(() => {
        document.body.classList.toggle('presenting', presenting);
        localStorage.setItem(STORAGE_KEY, presenting ? 'on' : 'off');
    }, [presenting]);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                setPresenting(on => !on);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    /** The name to show: the real one, or its stable alias while presenting. */
    const name = useCallback((real, kind) => {
        if (!presenting || !real) return real;
        const map = aliases.current;
        if (!map.has(real)) {
            const prefix = PREFIX[kind] || t('Контакт');
            const n = [...map.values()].filter(a => a.startsWith(prefix)).length + 1;
            map.set(real, `${prefix} ${n}`);
        }
        return map.get(real);
    }, [presenting]);

    const value = useMemo(() => ({ presenting, setPresenting, name }), [presenting, name]);

    return (
        <PresentationContext.Provider value={value}>
            {children}
            {presenting && (
                <Box
                    role="button"
                    title={t('Вимкнути режим презентації (Ctrl+Shift+H)')}
                    onClick={() => setPresenting(false)}
                    sx={(t) => ({
                        position: 'fixed', left: 16, bottom: 16, zIndex: 2000, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.6,
                        borderRadius: 999, fontSize: 12, fontWeight: 700,
                        color: t.c.onAccent, bgcolor: t.c.accent, boxShadow: t.c.shadowRaised,
                    })}
                >
                    <VisibilityOffOutlinedIcon sx={{ fontSize: 15 }} />
                    {t('Режим презентації')}
                </Box>
            )}
        </PresentationContext.Provider>
    );
}

export const usePresentation = () => useContext(PresentationContext);
