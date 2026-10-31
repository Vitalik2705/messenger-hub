import api from './api';

const telegramService = {
    getStatus: async () => {
        const response = await api.get('/telegram/status');
        return response.data;
    },
    getAccounts: async () => {
        const response = await api.get('/telegram/accounts');
        return response.data;
    },
    sendCode: async (phone) => {
        const response = await api.post('/telegram/auth/send-code', { phone });
        return response.data;
    },
    signIn: async (data) => {
        const response = await api.post('/telegram/auth/sign-in', data);
        return response.data;
    },
    signInPassword: async (data) => {
        const response = await api.post('/telegram/auth/sign-in-password', data);
        return response.data;
    },
    getChats: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.get('/telegram/chats', { params });
        return response.data;
    },
    getChatMessages: async (chatId, limit = 50, offset = 0, accountId = null) => {
        const params = { limit, offset };
        if (accountId) params.accountId = accountId;
        const response = await api.get(`/telegram/chats/${chatId}/messages`, { params });
        return response.data;
    },
    getMessageMedia: async (chatId, messageId, accountId = null) => {
        const params = { chatId, messageId };
        if (accountId) params.accountId = accountId;
        const response = await api.get('/telegram/message-media', { params });
        return response.data;
    },
    sendMessage: async (chatId, text, replyToMessageId = null, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/telegram/send', {
            chat_id: chatId,
            text,
            ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
        }, { params });
        return response.data;
    },
    sync: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/telegram/sync', {}, { params });
        return response.data;
    },
    getUserStatus: async (chatId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.get(`/telegram/user-status/${chatId}`, { params });
        return response.data;
    },
    getAvatar: async (chatId) => {
        const response = await api.get(`/telegram/avatar/${chatId}`);
        return response.data;
    },
    markAsRead: async (chatId, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post(`/telegram/mark-read/${chatId}`, {}, { params });
        return response.data;
    },
    togglePin: (chatId) => api.post(`/telegram/toggle-pin/${chatId}`),
    disconnect: async (accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/telegram/disconnect', {}, { params });
        return response.data;
    },
    deleteMessage: async (chatId, messageId, revoke = true, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/telegram/delete', {
            chat_id: chatId,
            message_id: messageId,
            revoke,
        }, { params });
        return response.data;
    },
    sendMedia: async ({ chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId }, accountId = null) => {
        const params = accountId ? { accountId } : {};
        const response = await api.post('/telegram/send-media', {
            chatId, dataBase64, mimeType, fileName, kind, durationSeconds, caption, replyToMessageId,
        }, { params });
        return response.data;
    },

};

export default telegramService;