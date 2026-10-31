import { useState, useEffect } from 'react';
import searchService from '../services/searchService';
import { t } from '../i18n';

const LIMIT = 15;
/** Below this many characters a query matches too much to be worth a request. */
export const MIN_QUERY = 2;

const fromResults = (res) => {
    const results = res.data.results || [];
    // The server reports a missing model as a result, not a failure — the word search
    // beside it still works.
    return { results, total: results.length, error: res.data.error || '' };
};

/** The three archive searches. History search narrows by network at most. */
const SEARCHERS = {
    hybrid: (q, { messenger, signal }) =>
        searchService.searchHybrid(q, { messenger, limit: LIMIT, signal }).then(fromResults),
    semantic: (q, { signal }) =>
        searchService.searchSemantic(q, { limit: LIMIT, signal }).then(fromResults),
    text: (q, { messenger, signal }) =>
        searchService.searchMessages(q, { messenger, limit: LIMIT, signal })
            .then(res => ({ results: res.data.results, total: res.data.total, error: '' })),
};

const IDLE = { results: [], total: 0, error: '', loading: false };

/**
 * Searches the archive as the user types: debounced, and aborted on the next keystroke so a slow
 * older answer cannot overwrite a newer one. Previous results stay visible while a new query runs.
 */
export default function useHistorySearch(query, mode, messenger) {
    const q = query.trim();
    const active = q.length >= MIN_QUERY;
    const key = `${mode}|${messenger || ''}|${q}`;
    const [state, setState] = useState({ key: '', ...IDLE });

    useEffect(() => {
        if (!active) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const found = await SEARCHERS[mode](q, { messenger, signal: controller.signal });
                setState({ key, ...found, loading: false });
            } catch {
                if (!controller.signal.aborted) {
                    setState({ key, ...IDLE, error: t('Не вдалося виконати пошук') });
                }
            }
        }, 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [active, key, mode, messenger, q]);

    if (!active) return IDLE;
    return state.key === key ? state : { ...state, loading: true };
}
