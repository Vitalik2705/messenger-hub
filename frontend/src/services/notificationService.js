import { plainText } from '../utils/richText';
import { t } from '../i18n';

const ENABLED_KEY = 'notifyEnabled';
const PREVIEW_KEY = 'notifyPreview';
const flag = (key) => localStorage.getItem(key) !== 'off'; // both on unless switched off

const notificationService = {
    /** Whether new messages notify at all — the user's choice, separate from the browser's permission. */
    isEnabled: () => flag(ENABLED_KEY),
    setEnabled: (on) => localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off'),

    /** Whether a notification shows the message itself or only who it is from. */
    showsPreview: () => flag(PREVIEW_KEY),
    setShowsPreview: (on) => localStorage.setItem(PREVIEW_KEY, on ? 'on' : 'off'),

    permission: () => ('Notification' in window ? Notification.permission : 'unsupported'),

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
        if (!notificationService.isGranted() || !notificationService.isEnabled()) return;
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
        // On a projector nobody's name or words belong in a system popup.
        if (document.body.classList.contains('presenting')) {
            notificationService.show(t('{0} Нове повідомлення', icon), '', { tag: 'presenting' });
            return;
        }
        notificationService.show(
            `${icon} ${chatName}`,
            // On a shared screen the text of a message is nobody else's business.
            (notificationService.showsPreview() && plainText(messageText)) || t('Нове повідомлення'),
            { tag: `chat-${chatName}` }
        );
    },
};

export default notificationService;