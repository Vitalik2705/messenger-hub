import EN from './en';

/*
 * Interface language. Ukrainian is the source: every string is written in Ukrainian in the
 * code and wrapped in t(), which returns it as is or looks up its English version.
 *
 * The language is read once at startup and switching reloads the page, so t() can be used
 * anywhere — including module-level constants — without a context or re-renders.
 */

const STORAGE_KEY = 'language';
export const LANGUAGES = [['uk', 'Українська'], ['en', 'English']];

export const LANGUAGE = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'uk';
/** Locale for dates and numbers. */
export const LOCALE = LANGUAGE === 'en' ? 'en-GB' : 'uk-UA';

document.documentElement.lang = LANGUAGE;

export function setLanguage(language) {
    localStorage.setItem(STORAGE_KEY, language);
    window.location.reload();
}

const fill = (text, args) => text.replace(/\{(\d+)\}/g, (m, i) => (args[i] ?? ''));

/**
 * The text in the current language. `{0}`, `{1}`… are filled from the remaining arguments.
 * An English entry may be a function of those arguments, for plurals.
 */
export function t(text, ...args) {
    if (typeof text !== 'string') return text; // e.g. a server message that is absent
    if (LANGUAGE === 'en') {
        const entry = EN[text];
        if (typeof entry === 'function') return entry(...args);
        if (entry != null) return fill(entry, args);
        for (const [pattern, replace] of EN_PATTERNS) {
            if (pattern.test(text)) return text.replace(pattern, replace);
        }
    }
    return fill(text, args);
}

/** Server messages that carry a number inside them. */
const EN_PATTERNS = [
    [/^Забагато невдалих спроб входу\. Спробуйте через (\d+) хв\.$/, 'Too many failed sign-in attempts. Try again in $1 min.'],
];

/** Ukrainian plural form for n: one (1, 21…), few (2–4, 22–24…), many. English: one or many. */
export function plural(n, one, few, many) {
    if (LANGUAGE === 'en') return n === 1 ? one : many;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}
