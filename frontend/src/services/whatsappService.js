import api from './api';

const whatsappService = {
    getStatus: async () => {
        const response = await api.get('/whatsapp/status');
        return response.data;
    },

    getAccounts: async () => {
        const response = await api.get('/whatsapp/accounts');
        return response.data;
    },

    initSession: async () => {
        const response = await api.post('/whatsapp/init-session');
        return response.data; // { sessionId, status }
    },

    checkSession: async (sessionId) => {
        const response = await api.get('/whatsapp/session-status', { params: { sessionId } });
        return response.data; // { status, qrBase64, accountId, username, phone }
    },

    getChats: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.get('/whatsapp/chats', { params });
        return response.data;
    },

    getChatMessages: async (externalChatId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.get(`/whatsapp/chats/${externalChatId}/messages`, { params });
        return response.data;
    },

    sendMessage: async (chatId, text, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/whatsapp/send', { chatId, text }, { params });
        return response.data;
    },

    disconnect: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/whatsapp/disconnect', {}, { params });
        return response.data;
    },
    sendMedia: async ({ chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId }, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/whatsapp/send-media', {
            chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId,
        }, { params });
        return response.data;
    },

    deleteMessage: async (chatId, messageId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/whatsapp/delete', { chatId, messageId }, { params });
        return response.data;
    },

};

export default whatsappService;
