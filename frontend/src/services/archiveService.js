import api from './api';

const archiveService = {
    /** How much conversation history has accumulated locally. */
    getStats: () => api.get('/archive/stats'),

    /**
     * Archived history of one chat from Postgres, oldest first. Fast, so the chat renders from it
     * while the live fetch runs; empty for a chat never archived.
     */
    getMessages: (accountId, externalChatId, limit = 50) =>
        api.get('/archive/messages', { params: { accountId, externalChatId, limit } })
            .then(r => r.data),

    /**
     * Transcripts of one chat's voice messages, keyed by the messenger's message id.
     * Merged into whichever copy of the conversation is on screen.
     */
    getTranscripts: (accountId, externalChatId) =>
        api.get('/archive/transcripts', { params: { accountId, externalChatId } }),
};

export default archiveService;
