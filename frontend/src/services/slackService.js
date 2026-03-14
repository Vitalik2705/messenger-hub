import api from './api';

const slackService = {
    getStatus: async () => {
        const response = await api.get('/slack/status');
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

    getChatMessages: async (externalChatId) => {
        const response = await api.get(`/slack/chats/${externalChatId}/messages`);
        return response.data;
    },

    sendMessage: async (channelId, text) => {
        const response = await api.post('/slack/send', { channelId, text });
        return response.data;
    },

    disconnect: async () => {
        const response = await api.post('/slack/disconnect');
        return response.data;
    },

    sync: async () => {
        const response = await api.post('/slack/sync');
        return response.data;
    },
};

export default slackService;