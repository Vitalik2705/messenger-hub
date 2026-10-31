import api from './api';

const remember = (data) => {
    if (!data.accessToken) return;
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
};

const authService = {
    register: async (data) => {
        const response = await api.post('/auth/register', data);
        remember(response.data);
        return response.data;
    },

    login: async (data) => {
        const response = await api.post('/auth/login', data);
        remember(response.data);
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    },

    getCurrentUser: () => {
        try {
            return JSON.parse(localStorage.getItem('user')) || null;
        } catch {
            return null; // a damaged entry is the same as being signed out
        }
    },

    storeUser: (user) => localStorage.setItem('user', JSON.stringify(user)),

    /** Takes over the new token pair issued when the server ended the other sessions. */
    adoptTokens: (data) => remember(data),
};

export default authService;
