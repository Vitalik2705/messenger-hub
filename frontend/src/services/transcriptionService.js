import api from './api';

const transcriptionService = {
    /**
     * Transcribes one voice message now. Addressed by the messenger's ids, which is what the chat
     * window has.
     */
    transcribeMessage: ({ accountId, externalChatId, externalMessageId }) =>
        api.post('/transcription/message', { accountId, externalChatId, externalMessageId }),

    /** How much of the archive's voice has been turned into text. */
    getStatus: () => api.get('/transcription/status'),
};

export default transcriptionService;
