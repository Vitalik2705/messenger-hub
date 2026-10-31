import api from './api';

const analysisService = {
    /** Metrics the server offers and models actually pulled on this machine. */
    getOptions: () => api.get('/analysis/options'),

    /**
     * Queues one run per model and returns them immediately — results arrive by polling.
     * Always an array, even for a single model, so callers never branch on the shape.
     */
    start: ({ chatId, metrics, models, messageLimit, includeSummary, promptIds }) =>
        api.post('/analysis/runs', { chatId, models, messageLimit, includeSummary, promptIds, metrics }),

    /** Every run, or just one chat's, newest first. */
    getRuns: (chatId) => api.get('/analysis/runs', { params: chatId ? { chatId } : {} }),

    getRun: (id) => api.get(`/analysis/runs/${id}`),

    remove: (id) => api.delete(`/analysis/runs/${id}`),

    /** The user's own questions, reusable across chats. */
    getPrompts: () => api.get('/analysis/prompts'),

    createPrompt: ({ name, prompt }) => api.post('/analysis/prompts', { name, prompt }),

    updatePrompt: (id, { name, prompt }) => api.patch(`/analysis/prompts/${id}`, { name, prompt }),

    removePrompt: (id) => api.delete(`/analysis/prompts/${id}`),

    // ── Batch sweeps across every chat ────────────────────────────────────────

    /** The ranking criteria the server offers. */
    getRankings: () => api.get('/analysis/batches/rankings'),

    startBatch: (request) => api.post('/analysis/batches', request),

    getBatches: () => api.get('/analysis/batches'),

    getBatch: (id) => api.get(`/analysis/batches/${id}`),

    removeBatch: (id) => api.delete(`/analysis/batches/${id}`),
};

export default analysisService;
