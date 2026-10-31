import api from './api';

/** Lines as the server wants them: who wrote, what, and whether it was the user. */
const toLines = (messages, chatName) => messages
    .filter((m) => m.text)
    .map((m) => ({ sender: m.isFromUser ? null : (m.senderName || chatName), text: m.text, fromMe: Boolean(m.isFromUser) }));

const assistService = {
    catchUp: async (messages, chatName) => {
        const response = await api.post('/assist/catch-up', { messages: toLines(messages, chatName) });
        return response.data;
    },
    suggestReplies: async (messages, chatName) => {
        const response = await api.post('/assist/replies', { messages: toLines(messages, chatName) });
        return response.data;
    },
    unanswered: async () => {
        const response = await api.get('/assist/unanswered');
        return response.data;
    },
};

export default assistService;
