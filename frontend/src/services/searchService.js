import api from './api';

const searchService = {
    /**
     * Search archived history across every connected messenger at once.
     *
     * @param {string} query        what the user typed; the server turns it into a tsquery
     * @param {object} [options]
     * @param {number} [options.chatId]     restrict to one chat
     * @param {string} [options.messenger]  restrict to one network, e.g. 'TELEGRAM'
     * @param {number} [options.limit]
     * @param {number} [options.offset]
     * @param {AbortSignal} [options.signal] to drop a request the user has already typed past
     */
    searchMessages: (query, { chatId, messenger, limit, offset, signal } = {}) =>
        api.get('/search/messages', {
            params: { q: query, chatId, messenger, limit, offset },
            signal,
        }),

    /** Search by meaning. Results carry no snippet, since nothing matched literally. */
    searchSemantic: (query, { limit, signal } = {}) =>
        api.get('/search/semantic', { params: { q: query, limit }, signal }),

    // Both searches merged into one ranking (Reciprocal Rank Fusion on the server).
    searchHybrid: (query, { messenger, limit, signal } = {}) =>
        api.get('/search/hybrid', { params: { q: query, messenger, limit }, signal }),
};

export default searchService;
