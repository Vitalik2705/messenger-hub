/**
 * The design system, in one place.
 *
 * Everything used to be an inline `sx` literal, which meant the palette lived in about
 * fifteen files at once and could not be changed — or given a dark variant — without
 * touching all of them. Components now read these tokens and nothing else.
 */

/**
 * The messengers' own colours.
 *
 * These are the only saturated hues the interface is allowed to show, and they are the
 * reason the rest of the palette is nearly grey: an aggregator that paints itself in a
 * loud accent ends up competing with the very networks it is aggregating. Four of the
 * five are cool blues and purples, which is what pushes the app's own accent to the warm
 * side — nothing there can be mistaken for a network.
 */
export const MESSENGER_COLORS = {
    TELEGRAM: '#2AABEE',
    SLACK: '#8C5A94',
    DISCORD: '#5865F2',
    WHATSAPP: '#25D366',
    VIBER: '#7B5CF0',
};

export const MESSENGER_LABELS = {
    TELEGRAM: 'Telegram',
    SLACK: 'Slack',
    DISCORD: 'Discord',
    WHATSAPP: 'WhatsApp',
    VIBER: 'Viber',
};

/**
 * Neutrals carry a faint cool cast rather than being pure grey — against it the messenger
 * blues and greens read as their real selves instead of drifting warm.
 *
 * Every text colour here clears WCAG AA (4.5:1) against every surface it is used on. The
 * previous `textFaint` sat at 2.66:1 on the page background, which is roughly half the
 * requirement — and it carried every small label, timestamp and hint in the interface, at
 * 10.5px. "Muted" had quietly become "unreadable".
 *
 * `accent` and `accentText` are separate for the same reason: the fill needs white text on
 * it to pass, and the same hue used *as* text on a light ground needs to be darker. One
 * value cannot do both.
 */
const light = {
    mode: 'light',

    bg: '#F4F4F6',            // the ground everything sits on
    surface: '#FFFFFF',       // cards, message list, input
    surfaceAlt: '#FAFAFB',    // sidebar
    surfaceSunken: '#EFEFF2', // search field, inactive chips
    surfaceHover: '#F1F1F4',
    surfaceActive: '#E9E9EE',

    border: '#E7E7EB',
    borderStrong: '#D5D5DC',

    text: '#111318',
    textMuted: '#50535C',
    textFaint: '#686B76',

    accent: '#D24525',
    accentHover: '#B8391C',
    accentSoft: 'rgba(210, 69, 37, 0.10)',
    accentText: '#B8391C',
    onAccent: '#FFFFFF',

    danger: '#C8341F',
    success: '#1B9E5A',

    shadow: '0 1px 2px rgba(17, 19, 24, 0.05)',
    shadowRaised: '0 6px 20px rgba(17, 19, 24, 0.09)',
    scrim: 'rgba(17, 19, 24, 0.35)',
};

/**
 * Not an inversion of the light palette. Dark surfaces need their separation to come from
 * lightness steps rather than borders, and the accent has to lift to stay legible, so both
 * are tuned rather than flipped.
 */
const dark = {
    mode: 'dark',

    bg: '#0C0D10',
    surface: '#15171B',
    surfaceAlt: '#101215',
    surfaceSunken: '#1B1E23',
    surfaceHover: '#1E2126',
    surfaceActive: '#262A31',

    border: '#232629',
    borderStrong: '#33373D',

    text: '#ECEDF0',
    textMuted: '#9EA2AC',
    textFaint: '#8B8F99',

    accent: '#FF6146',
    accentHover: '#FF7862',
    accentSoft: 'rgba(255, 97, 70, 0.14)',
    accentText: '#FF7A62',
    onAccent: '#1A0B07',

    danger: '#FF6B57',
    success: '#3DD68C',

    shadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
    shadowRaised: '0 8px 28px rgba(0, 0, 0, 0.5)',
    scrim: 'rgba(0, 0, 0, 0.6)',
};

export const palettes = { light, dark };

/**
 * One family throughout. The old interface paired a serif display face with a sans body,
 * which is an editorial pairing wearing an application's clothes — the mismatch was the
 * single loudest thing about it.
 */
export const FONT_STACK =
    "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Rounded, but not uniformly — a pill on everything flattens the hierarchy.
 *
 * These are px strings, not numbers, and deliberately so. MUI treats a *numeric*
 * `borderRadius` in `sx` as a multiplier of `theme.shape.borderRadius`, so `radius.lg`
 * written as 13 rendered at 117px and turned every card into a lozenge. A string is
 * passed through untouched, which is the only way a token can mean what it says.
 */
export const radius = {
    sm: '6px',
    md: '9px',
    lg: '13px',
    xl: '18px',
    pill: '999px',
};

export const type = {
    micro: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' },
    caption: { fontSize: 11.5, fontWeight: 500 },
    body: { fontSize: 13.5, fontWeight: 450, lineHeight: 1.55 },
    bodyStrong: { fontSize: 13.5, fontWeight: 650 },
    title: { fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' },
    display: { fontSize: 19, fontWeight: 800, letterSpacing: '-0.025em' },
};

/** Times and counters sit in columns; proportional digits make them jitter. */
export const numeric = { fontVariantNumeric: 'tabular-nums' };
