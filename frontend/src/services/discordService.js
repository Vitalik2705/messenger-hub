import api from './api';

const discordService = {
    getStatus: async () => {
        const response = await api.get('/discord/status');
        return response.data;
    },

    getAccounts: async () => {
        const response = await api.get('/discord/accounts');
        return response.data;
    },

    connect: async (token) => {
        const response = await api.post('/discord/connect', { token });
        return response.data;
    },

    getChats: async () => {
        const response = await api.get('/discord/chats');
        return response.data;
    },

    getChatMessages: async (externalChatId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.get(`/discord/chats/${externalChatId}/messages`, { params });
        return response.data;
    },

    sendMessage: async (channelId, text, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/discord/send', { channelId, text }, { params });
        return response.data;
    },

    disconnect: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/discord/disconnect', {}, { params });
        return response.data;
    },

    sync: async () => {
        const response = await api.post('/discord/sync');
        return response.data;
    },
    sendMedia: async ({ chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId }, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/discord/send-media', {
            chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId,
        }, { params });
        return response.data;
    },

    deleteMessage: async (chatId, messageId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/discord/delete', { chatId, messageId }, { params });
        return response.data;
    },

};

export default discordService;
