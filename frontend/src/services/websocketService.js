import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

class WebSocketService {
    constructor() {
        this.client = null;
        this.connected = false;
    }

    connect(userId, onMessageReceived) {
        const socket = new SockJS('http://localhost:8079/ws');

        this.client = new Client({
            webSocketFactory: () => socket,
            debug: (str) => {
                console.log('STOMP Debug:', str);
            },
            reconnectDelay: 5000,
            heartbeatIncoming: 4000,
            heartbeatOutgoing: 4000,
        });

        this.client.onConnect = () => {
            console.log('WebSocket Connected');
            this.connected = true;

            // Підписатися на повідомлення для конкретного користувача
            this.client.subscribe(`/topic/user/${userId}/messages`, (message) => {
                const newMessage = JSON.parse(message.body);
                console.log('New message received:', newMessage);
                onMessageReceived(newMessage);
            });
        };

        this.client.onStompError = (frame) => {
            console.error('STOMP error:', frame);
        };

        this.client.activate();
    }

    disconnect() {
        if (this.client) {
            this.client.deactivate();
            this.connected = false;
            console.log('WebSocket Disconnected');
        }
    }

    isConnected() {
        return this.connected;
    }
}

export default new WebSocketService();