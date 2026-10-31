import api from './api';

const slackService = {
    getStatus: async () => {
        const response = await api.get('/slack/status');
        return response.data;
    },

    getAccounts: async () => {
        const response = await api.get('/slack/accounts');
        return response.data;
    },

    connect: async (token) => {
        const response = await api.post('/slack/connect', { token });
        return response.data;
    },

    getChats: async () => {
        const response = await api.get('/slack/chats');
        return response.data;
    },

    getChatMessages: async (externalChatId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.get(`/slack/chats/${externalChatId}/messages`, { params });
        return response.data;
    },

    sendMessage: async (channelId, text, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/slack/send', { channelId, text }, { params });
        return response.data;
    },

    disconnect: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/slack/disconnect', {}, { params });
        return response.data;
    },

    sync: async () => {
        const response = await api.post('/slack/sync');
        return response.data;
    },
    sendMedia: async ({ chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId }, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/slack/send-media', {
            chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId,
        }, { params });
        return response.data;
    },

    deleteMessage: async (chatId, messageId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/slack/delete', { chatId, messageId }, { params });
        return response.data;
    },

};

export default slackService;
