import api from './api';

const archiveService = {
    /** How much conversation history has accumulated locally. */
    getStats: () => api.get('/archive/stats'),

    /**
     * Locally archived history for one chat, oldest first.
     *
     * Answers from Postgres rather than the messenger, so it returns in milliseconds and
     * is what a chat renders from while the live fetch is still in flight. Returns an
     * empty list for a chat that has never been archived.
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
