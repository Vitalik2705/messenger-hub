import { t } from '../i18n';
/**
 * Reads an API error into what a form shows: one message for the top of the form and, for
 * validation errors, a message per field so each can sit under its own input.
 */
export function formErrors(error, fallback) {
    const data = error?.response?.data;
    if (!error?.response) {
        return { message: t('Сервер недоступний. Перевірте, чи запущено застосунок.'), fields: {} };
    }
    const fields = Object.fromEntries(Object.entries(data?.fields || {}).map(([k, v]) => [k, t(v)]));
    return { message: t(data?.message) || fallback, fields };
}

/**
 * Password strength 0–4 with a label, from length and character variety. A hint while typing; the
 * server only requires eight characters.
 */
export function passwordStrength(password) {
    if (!password) return { score: 0, label: '' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-zа-яії]/.test(password) && /[A-ZА-ЯІЇ]/.test(password)) score += 1;
    if (/\d/.test(password) && /[^\p{L}\d]/u.test(password)) score += 1;
    if (password.length < 8) score = Math.min(score, 1);
    return { score, label: [t('Дуже слабкий'), t('Слабкий'), t('Нормальний'), t('Добрий'), t('Надійний')][score] };
}
