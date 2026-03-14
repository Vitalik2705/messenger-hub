const notificationService = {
    // Request permission on app load — called once
    requestPermission: async () => {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    },

    isGranted: () => {
        return 'Notification' in window && Notification.permission === 'granted';
    },

    // Fire a notification
    show: (title, body, options = {}) => {
        if (!notificationService.isGranted()) return;
        if (document.visibilityState === 'visible') return; // tab is focused, skip

        const notification = new Notification(title, {
            body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: options.tag || 'messenger-hub', // same tag = replace previous
            renotify: true,
            ...options,
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            if (options.onClick) options.onClick();
        };

        // Auto close after 5 seconds
        setTimeout(() => notification.close(), 5000);
    },

    showMessage: (chatName, messageText, messengerType) => {
        const icon = messengerType === 'TELEGRAM' ? '✈️' : '💬';
        notificationService.show(
            `${icon} ${chatName}`,
            messageText || 'New message',
            { tag: `chat-${chatName}` }
        );
    },
};

export default notificationService;