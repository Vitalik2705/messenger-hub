import api from './api';

const digestService = {
    /** Queues a digest for a window; the result arrives by polling, like every model job. */
    start: ({ hoursBack, model, topN, scope }) =>
        api.post('/digest', { hoursBack, model, topN, scope }),

    getDigests: () => api.get('/digest'),

    remove: (id) => api.delete(`/digest/${id}`),
};

export default digestService;
