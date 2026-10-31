import api from './api';

const viberService = {
    getStatus: async () => {
        const response = await api.get('/viber/status');
        return response.data;
    },

    getAccounts: async () => {
        const response = await api.get('/viber/accounts');
        return response.data;
    },

    connect: async (token) => {
        const response = await api.post('/viber/connect', { token });
        return response.data;
    },

    getChats: async () => {
        const response = await api.get('/viber/chats');
        return response.data;
    },

    getChatMessages: async (externalChatId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.get(`/viber/chats/${externalChatId}/messages`, { params });
        return response.data;
    },

    sendMessage: async (userId, text, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/viber/send', { userId, text }, { params });
        return response.data;
    },

    disconnect: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/viber/disconnect', {}, { params });
        return response.data;
    },
    sendMedia: async ({ chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId }, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/viber/send-media', {
            chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId,
        }, { params });
        return response.data;
    },

    deleteMessage: async (chatId, messageId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/viber/delete', { chatId, messageId }, { params });
        return response.data;
    },

};

export default viberService;
