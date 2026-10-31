import { t } from '../i18n';
/** Design tokens: colours, radii and type. Components read these instead of literal values. */

/**
 * The messengers' brand colours — the only saturated hues in the interface, which is why the rest
 * of the palette is near-grey.
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
 * Light palette. Neutrals have a slight cool cast. Every text colour meets WCAG AA (4.5:1) on the
 * surfaces it is used on. `accent` (a fill with white text) and `accentText` (the hue as text) are
 * separate because one value cannot pass both.
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
 * Dark palette, tuned rather than inverted: separation comes from lightness steps, and the accent
 * is lifted to stay legible.
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

/** Accent presets. Each is tuned per mode; light accents carry white text at WCAG AA. */
export const ACCENTS = {
    coral: {
        label: t('Корал'),
        light: { accent: '#D24525', accentHover: '#B8391C', accentSoft: 'rgba(210, 69, 37, 0.10)', accentText: '#B8391C', onAccent: '#FFFFFF' },
        dark: { accent: '#FF6146', accentHover: '#FF7862', accentSoft: 'rgba(255, 97, 70, 0.14)', accentText: '#FF7A62', onAccent: '#1A0B07' },
    },
    blue: {
        label: t('Синій'),
        light: { accent: '#2563EB', accentHover: '#1D4ED8', accentSoft: 'rgba(37, 99, 235, 0.10)', accentText: '#1D4ED8', onAccent: '#FFFFFF' },
        dark: { accent: '#5B8CFF', accentHover: '#7AA2FF', accentSoft: 'rgba(91, 140, 255, 0.16)', accentText: '#86A9FF', onAccent: '#081022' },
    },
    violet: {
        label: t('Фіолетовий'),
        light: { accent: '#7C3AED', accentHover: '#6D28D9', accentSoft: 'rgba(124, 58, 237, 0.10)', accentText: '#6D28D9', onAccent: '#FFFFFF' },
        dark: { accent: '#A78BFA', accentHover: '#C4B5FD', accentSoft: 'rgba(167, 139, 250, 0.16)', accentText: '#BBA6FF', onAccent: '#160D2C' },
    },
    green: {
        label: t('Зелений'),
        light: { accent: '#0B875C', accentHover: '#08734E', accentSoft: 'rgba(11, 135, 92, 0.10)', accentText: '#08734E', onAccent: '#FFFFFF' },
        dark: { accent: '#34D399', accentHover: '#6EE7B7', accentSoft: 'rgba(52, 211, 153, 0.15)', accentText: '#4ADEA8', onAccent: '#04200F' },
    },
    rose: {
        label: t('Рожевий'),
        light: { accent: '#DB2777', accentHover: '#BE185D', accentSoft: 'rgba(219, 39, 119, 0.10)', accentText: '#BE185D', onAccent: '#FFFFFF' },
        dark: { accent: '#F472B6', accentHover: '#F9A8D4', accentSoft: 'rgba(244, 114, 182, 0.16)', accentText: '#F78CC4', onAccent: '#2A0918' },
    },
};

/** File-type colours for attachment cards. */
export const FILE_COLORS = {
    pdf: '#E5484D', doc: '#2B6CB0', sheet: '#16A34A', slides: '#EA8A0C',
    archive: '#A16207', image: '#9333EA', audio: '#0EA5E9', video: '#DB2777', other: '#6B7280',
};

/** One font family throughout. */
export const FONT_STACK =
    "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Corner radii. Px strings, not numbers: MUI multiplies a numeric `borderRadius` in `sx` by
 * `theme.shape.borderRadius`.
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
