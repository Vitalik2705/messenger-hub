import api from './api';

const systemService = {
    getStatus: async () => {
        const response = await api.get('/system/status');
        return response.data;
    },
};

export default systemService;
