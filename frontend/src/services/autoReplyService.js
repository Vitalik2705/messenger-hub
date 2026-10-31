import api from './api';

const autoReplyService = {
    getSettings: () => api.get('/autoreply/settings'),

    updateSettings: (settings) => api.put('/autoreply/settings', settings),

    getChatMode: (chatId) => api.get(`/autoreply/chats/${chatId}/mode`),

    setChatMode: (chatId, mode) => api.put(`/autoreply/chats/${chatId}/mode`, { mode }),

    /** The suggestion waiting for one chat, or an empty object when there is none. */
    getDraft: (chatId) => api.get('/autoreply/drafts', { params: { chatId } }),

    /** SENT | SENT_EDITED | REJECTED — this is what the acceptance rate is built from. */
    resolveDraft: (id, status) => api.post(`/autoreply/drafts/${id}/resolve`, { status }),

    getStats: () => api.get('/autoreply/stats'),
};

export default autoReplyService;
