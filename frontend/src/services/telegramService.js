import api from './api';

const telegramService = {
    getStatus: async () => {
        const response = await api.get('/telegram/status');
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
    getChats: async () => {
        const response = await api.get('/telegram/chats');
        return response.data;
    },
    getChatMessages: async (chatId, limit = 50, offset = 0) => {
        const response = await api.get(`/telegram/chats/${chatId}/messages`, {
            params: { limit, offset }
        });
        return response.data;
    },
    getMessageMedia: async (chatId, messageId) => {
        const response = await api.get('/telegram/message-media', {
            params: { chatId, messageId }
        });
        return response.data;
    },
    sendMessage: async (chatId, text, replyToMessageId = null) => {
        const response = await api.post('/telegram/send', {
            chat_id: chatId,
            text,
            ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
        });
        return response.data;
    },
    sync: async () => {
        const response = await api.post('/telegram/sync');
        return response.data;
    },
    getUserStatus: async (chatId) => {
        const response = await api.get(`/telegram/user-status/${chatId}`);
        return response.data;
    },
    getAvatar: async (chatId) => {
        const response = await api.get(`/telegram/avatar/${chatId}`);
        return response.data;
    },
    markAsRead: async (chatId) => {
        const response = await api.post(`/telegram/mark-read/${chatId}`);
        return response.data;
    },
    togglePin: (chatId) => api.post(`/telegram/toggle-pin/${chatId}`),
    disconnect: async () => {
        const response = await api.post('/telegram/disconnect');
        return response.data;
    },
};

export default telegramService;