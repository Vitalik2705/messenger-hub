import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import buildTheme from '../theme';

const STORAGE_KEY = 'themeMode';

const ThemeModeContext = createContext({ mode: 'light', toggleMode: () => {} });

export const useThemeMode = () => useContext(ThemeModeContext);

function preferredMode() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Owns the light/dark choice for the whole app.
 *
 * An explicit choice is remembered and wins from then on; until the user makes one the app
 * follows the system and keeps following it, so someone whose machine switches at dusk
 * does not have to switch here too.
 */
export function ThemeModeProvider({ children }) {
    const [mode, setMode] = useState(preferredMode);

    useEffect(() => {
        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!media) return;
        const follow = (event) => {
            if (!localStorage.getItem(STORAGE_KEY)) setMode(event.matches ? 'dark' : 'light');
        };
        media.addEventListener('change', follow);
        return () => media.removeEventListener('change', follow);
    }, []);

    const toggleMode = useCallback(() => {
        setMode((current) => {
            const next = current === 'dark' ? 'light' : 'dark';
            localStorage.setItem(STORAGE_KEY, next);
            return next;
        });
    }, []);

    const theme = useMemo(() => buildTheme(mode), [mode]);
    const value = useMemo(() => ({ mode, toggleMode }), [mode, toggleMode]);

    return (
        <ThemeModeContext.Provider value={value}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </ThemeModeContext.Provider>
    );
}

export default ThemeModeContext;
