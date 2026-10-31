import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { SERVER_URL, getFreshAccessToken } from './api';

class WebSocketService {
    constructor() {
        this.client = null;
        this.connected = false;
    }

    connect(onMessageReceived) {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.warn('WebSocket: no access token, skipping connection');
            return;
        }

        this.client = new Client({
            // A factory, not a single socket: the same socket cannot be reused
            // after a drop, so reconnects need a fresh one each time.
            webSocketFactory: () => new SockJS(`${SERVER_URL}/ws`),
            connectHeaders: { Authorization: `Bearer ${token}` },
            // A fresh token on every connect attempt: the access token lives 15 minutes, and a
            // reconnect with an expired one is refused forever.
            beforeConnect: async (client) => {
                try {
                    client.connectHeaders = { Authorization: `Bearer ${await getFreshAccessToken()}` };
                } catch {
                    // Refresh failed; the next attempt tries again, and the HTTP side
                    // sends the user to the login page if the session is really over.
                }
            },
            debug: () => {},
            reconnectDelay: 5000,
            heartbeatIncoming: 4000,
            heartbeatOutgoing: 4000,
        });

        this.client.onConnect = () => {
            this.connected = true;
            // The server resolves /user/... to this session's authenticated principal,
            // so there is no user id to pass and no way to read another user's stream.
            this.client.subscribe('/user/queue/messages', (message) => {
                onMessageReceived(JSON.parse(message.body));
            });
        };

        this.client.onStompError = (frame) => {
            console.error('STOMP error:', frame.headers?.message || frame);
        };

        this.client.activate();
    }

    disconnect() {
        if (this.client) {
            this.client.deactivate();
            this.connected = false;
        }
    }

    isConnected() {
        return this.connected;
    }
}

export default new WebSocketService();
