import { createTheme } from '@mui/material';
import { FONT_STACK, palettes, radius, ACCENTS } from './tokens';

/** Builds the MUI theme for a mode. Tokens are attached as `theme.c` for `sx` callbacks. */
export function buildTheme(mode, accent = 'coral', bubbles = 'filled') {
    const base = palettes[mode] || palettes.light;
    const preset = ACCENTS[accent] || ACCENTS.coral;
    const c = { ...base, ...(mode === 'dark' ? preset.dark : preset.light), bubbles };

    return createTheme({
        c,
        palette: {
            mode,
            primary: { main: c.accent, contrastText: c.onAccent },
            error: { main: c.danger },
            success: { main: c.success },
            background: { default: c.bg, paper: c.surface },
            text: { primary: c.text, secondary: c.textMuted },
            divider: c.border,
        },
        // MUI's own default. Components that still write `borderRadius: 2` MUI-style are
        // multiplying by this, and were drawn against a base of 4; raising it silently
        // inflated every one of them.
        shape: { borderRadius: 4 },
        typography: {
            fontFamily: FONT_STACK,
            // The scale is expressed in tokens; these keep MUI's own defaults from
            // reintroducing Roboto sizing where a component slips through.
            button: { textTransform: 'none', fontWeight: 650 },
            body1: { fontSize: 13.5 },
            body2: { fontSize: 12 },
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    /**
                     * The same tokens as CSS custom properties, for static style objects that
                     * cannot use a theme callback.
                     */
                    ':root': {
                        '--c-bg': c.bg,
                        '--c-surface': c.surface,
                        '--c-surface-alt': c.surfaceAlt,
                        '--c-surface-sunken': c.surfaceSunken,
                        '--c-surface-hover': c.surfaceHover,
                        '--c-border': c.border,
                        '--c-border-strong': c.borderStrong,
                        '--c-text': c.text,
                        '--c-text-muted': c.textMuted,
                        '--c-text-faint': c.textFaint,
                        '--c-accent': c.accent,
                        '--c-accent-text': c.accentText,
                        '--c-accent-hover': c.accentHover,
                        '--c-accent-soft': c.accentSoft,
                        '--c-on-accent': c.onAccent,
                        '--c-danger': c.danger,
                        '--c-success': c.success,
                    },
                    // Presentation mode: someone else's words stay blurred until pointed at.
                    'body.presenting [data-private]': { filter: 'blur(5px)', transition: 'filter .15s' },
                    'body.presenting [data-private]:hover': { filter: 'none' },
                    body: {
                        backgroundColor: c.bg,
                        color: c.text,
                        // Without this the browser paints native controls — scrollbars,
                        // the file picker, form fields — in the opposite theme.
                        colorScheme: mode,
                    },
                    '*::-webkit-scrollbar': { width: 8, height: 8 },
                    '*::-webkit-scrollbar-track': { background: 'transparent' },
                    '*::-webkit-scrollbar-thumb': {
                        background: c.borderStrong,
                        borderRadius: 8,
                        border: `2px solid transparent`,
                        backgroundClip: 'content-box',
                    },
                    '*::-webkit-scrollbar-thumb:hover': { background: c.textFaint },
                },
            },
            MuiIconButton: {
                styleOverrides: {
                    root: {
                        borderRadius: radius.md,
                        color: c.textMuted,
                        '&:hover': { backgroundColor: c.surfaceHover, color: c.text },
                    },
                },
            },
            MuiTooltip: {
                styleOverrides: {
                    tooltip: {
                        backgroundColor: c.text,
                        color: c.surface,
                        fontSize: 11.5,
                        fontWeight: 550,
                        borderRadius: radius.sm,
                        padding: '5px 9px',
                    },
                },
            },
            MuiDialog: {
                styleOverrides: {
                    paper: {
                        backgroundColor: c.surface,
                        backgroundImage: 'none',
                        borderRadius: radius.xl,
                        border: `1px solid ${c.border}`,
                        boxShadow: c.shadowRaised,
                    },
                },
            },
        },
    });
}

export default buildTheme;
