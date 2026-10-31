import { MESSENGER_COLORS } from '../theme/tokens';

/**
 * Formatting helpers, shared so the app speaks with one voice.
 *
 * The locale is named explicitly everywhere. Passing `[]` — as the chat list used to —
 * hands the choice to the operating system, which is how a Ukrainian interface ended up
 * printing `06:59 PM`.
 */
const LOCALE = 'uk-UA';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Clock time, 24-hour. */
export function formatClock(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString(LOCALE, {
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

/**
 * A timestamp in a list, at the precision that is actually useful: the time today, a word
 * for yesterday, a weekday within the week, a date beyond it.
 */
export function formatListTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const elapsed = Date.now() - date.getTime();

    if (elapsed < DAY && date.getDate() === new Date().getDate()) return formatClock(date);
    if (elapsed < 2 * DAY) return 'Вчора';
    if (elapsed < 7 * DAY) return date.toLocaleDateString(LOCALE, { weekday: 'short' });
    if (date.getFullYear() === new Date().getFullYear()) {
        return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    }
    return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: '2-digit' });
}

/** Day separators inside a conversation. */
export function formatDayLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date(today.getTime() - DAY);

    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(date, today)) return 'Сьогодні';
    if (sameDay(date, yesterday)) return 'Вчора';
    if (date.getFullYear() === today.getFullYear()) {
        return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    }
    return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** mm:ss for recordings and playback. */
export function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds || 0));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatCount(value) {
    const count = value || 0;
    return count > 99 ? '99+' : String(count);
}

/**
 * A faint wash of the network's own colour, used behind avatars that have no picture.
 *
 * It replaces a set of eight rainbow gradients picked by the first character of the name —
 * decoration that carried no information and made a list of twelve chats look like a
 * paint chart. This at least says something true about the row.
 */
export function avatarTint(messengerType) {
    const base = MESSENGER_COLORS[messengerType] || '#8A8F98';
    return `${base}26`; // ~15% alpha
}

export function initialsOf(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}
