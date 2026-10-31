import axios from 'axios';

// Baked in at build time. The browser resolves this, not the container, so in Docker it
// is the address the backend is published on — never the compose service name.
export const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:8279';
const API_BASE_URL = `${SERVER_URL}/api`;

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Background jobs run only while the user is idle, judged by requests. Requests with no recent
// click or keystroke (timers, polls) are marked X-Background so they do not count as activity.
const INTERACTION_WINDOW_MS = 10_000;
let lastInteraction = Date.now();
if (typeof window !== 'undefined') {
    const touch = () => { lastInteraction = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(type =>
        window.addEventListener(type, touch, { passive: true, capture: true }));
}

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) config.headers.Authorization = `Bearer ${token}`;
        if (Date.now() - lastInteraction > INTERACTION_WINDOW_MS) config.headers['X-Background'] = '1';
        return config;
    },
    (error) => Promise.reject(error)
);

/** Ends the session, removing only the auth keys so preferences survive. */
const endSession = () => {
    ['accessToken', 'refreshToken', 'user'].forEach(key => localStorage.removeItem(key));
    window.location.href = '/login';
};

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

const doRefresh = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
        endSession();
        throw new Error('No refresh token');
    }
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    const { accessToken, refreshToken: newRefreshToken } = response.data;
    localStorage.setItem('accessToken', accessToken);
    if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    return accessToken;
};

// Whether a JWT is expired or about to be. Read from its payload — no request needed.
const expiresSoon = (token) => {
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const { exp } = JSON.parse(atob(payload));
        return !exp || exp * 1000 - Date.now() < 30_000;
    } catch {
        return true;
    }
};

/**
 * A usable access token, refreshed first if it is about to expire. For the WebSocket, which never
 * sees the 401 that triggers the interceptor; shares the in-flight refresh with it.
 */
export const getFreshAccessToken = async () => {
    const token = localStorage.getItem('accessToken');
    if (token && !expiresSoon(token)) return token;
    if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }));
    }
    isRefreshing = true;
    try {
        const fresh = await doRefresh();
        processQueue(null, fresh);
        return fresh;
    } catch (e) {
        processQueue(e, null);
        throw e;
    } finally {
        isRefreshing = false;
    }
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // Handle both 401 and 403 as token errors — except from the sign-in endpoints
        // themselves, where 401 means "wrong password" and has to reach the form rather
        // than send a signed-out user round a refresh and back to /login.
        const isAuthCall = originalRequest?.url?.startsWith('/auth/');
        if ((status === 401 || status === 403) && !originalRequest._retry && !isAuthCall) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                }).catch(err => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const token = await doRefresh();
                processQueue(null, token);
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                endSession();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;