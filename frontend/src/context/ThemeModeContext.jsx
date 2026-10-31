import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import buildTheme from '../theme';

const STORAGE_KEY = 'themeMode';
const ACCENT_KEY = 'themeAccent';
const BUBBLES_KEY = 'themeBubbles';

const ThemeModeContext = createContext({
    mode: 'light', toggleMode: () => {}, setMode: () => {},
    accent: 'coral', setAccent: () => {}, bubbles: 'filled', setBubbles: () => {},
});

export const useThemeMode = () => useContext(ThemeModeContext);

function preferredMode() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Light/dark mode, accent and bubble style. Follows the system until the user chooses explicitly;
 * the choice is remembered.
 */
export function ThemeModeProvider({ children }) {
    const [mode, setModeState] = useState(preferredMode);
    const [accent, setAccentState] = useState(() => localStorage.getItem(ACCENT_KEY) || 'coral');
    const [bubbles, setBubblesState] = useState(() => localStorage.getItem(BUBBLES_KEY) || 'filled');

    useEffect(() => {
        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!media) return;
        const follow = (event) => {
            if (!localStorage.getItem(STORAGE_KEY)) setModeState(event.matches ? 'dark' : 'light');
        };
        media.addEventListener('change', follow);
        return () => media.removeEventListener('change', follow);
    }, []);

    const toggleMode = useCallback(() => {
        setModeState((current) => {
            const next = current === 'dark' ? 'light' : 'dark';
            localStorage.setItem(STORAGE_KEY, next);
            return next;
        });
    }, []);

    const setMode = useCallback((next) => {
        localStorage.setItem(STORAGE_KEY, next);
        setModeState(next);
    }, []);
    const setAccent = useCallback((next) => {
        localStorage.setItem(ACCENT_KEY, next);
        setAccentState(next);
    }, []);
    const setBubbles = useCallback((next) => {
        localStorage.setItem(BUBBLES_KEY, next);
        setBubblesState(next);
    }, []);

    const theme = useMemo(() => buildTheme(mode, accent, bubbles), [mode, accent, bubbles]);
    const value = useMemo(
        () => ({ mode, toggleMode, setMode, accent, setAccent, bubbles, setBubbles }),
        [mode, toggleMode, setMode, accent, setAccent, bubbles, setBubbles],
    );

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
