import api from './api';

const transcriptionService = {
    /**
     * Transcribes one voice message now and returns the text.
     *
     * Addressed by the messenger's own ids rather than a database id — the chat window
     * renders messages fetched live from the messenger and never sees our row ids.
     */
    transcribeMessage: ({ accountId, externalChatId, externalMessageId }) =>
        api.post('/transcription/message', { accountId, externalChatId, externalMessageId }),

    /** How much of the archive's voice has been turned into text. */
    getStatus: () => api.get('/transcription/status'),

    /** Runs one background batch immediately instead of waiting for the next tick. */
    runNow: () => api.post('/transcription/run'),
};

export default transcriptionService;
