import { useState, useEffect, useRef, useCallback } from 'react';
import SERVICES from '../services/messengerServices';
import telegramService from '../services/telegramService';
import notificationService from '../services/notificationService';

/** The networks in the order they are listed everywhere in the interface. */
export const NETWORK_TYPES = ['TELEGRAM', 'SLACK', 'DISCORD', 'WHATSAPP', 'VIBER'];

const byNetwork = () => Object.fromEntries(NETWORK_TYPES.map(type => [type, []]));

/**
 * Background refresh interval. Each pass fetches every connected account's dialog list and shares
 * Telethon's connection with user-initiated requests.
 */
const CHAT_POLL_INTERVAL = 25000;

/** Keeps what a refresh does not carry: avatars (polls skip them) and a just-toggled pin. */
function merge(previous, incoming) {
    const before = new Map(previous.map(c => [c.externalChatId, c]));
    return incoming.map(chat => {
        const old = before.get(chat.externalChatId);
        if (!old) return chat;
        return { ...chat, avatarBase64: chat.avatarBase64 || old.avatarBase64, isPinned: old.isPinned ?? chat.isPinned };
    });
}

/** A desktop notification for every chat whose unread count went up since the last pass. */
function notifyNew(type, previous, incoming) {
    if (previous.length === 0) return; // the first list is not news
    const unreadBefore = new Map(previous.map(c => [c.externalChatId, c.unreadCount || 0]));
    incoming.forEach(chat => {
        if ((chat.unreadCount || 0) > (unreadBefore.get(chat.externalChatId) || 0)) {
            notificationService.showMessage(chat.name, chat.lastMessage, type);
        }
    });
}

/**
 * Connected accounts and their chats for all networks, keyed by network type; the service for each
 * comes from one table.
 */
export default function useMessengers() {
    const [accounts, setAccounts] = useState(byNetwork);
    const [chats, setChats] = useState(byNetwork);
    const chatsRef = useRef(chats);
    const pollInFlight = useRef(false);
    const avatarRequested = useRef(new Set());

    useEffect(() => { chatsRef.current = chats; }, [chats]);

    const setChatsOf = useCallback((type, update) => {
        setChats(prev => ({ ...prev, [type]: typeof update === 'function' ? update(prev[type]) : update }));
    }, []);

    /** Quiet on failure: one network being down must not empty the others or break the page. */
    const loadChats = useCallback(async (type) => {
        try {
            setChatsOf(type, await SERVICES[type].getChats());
        } catch { /* the previous list stays until the next pass */ }
    }, [setChatsOf]);

    /** Re-reads one network's accounts and its chats; returns the accounts, or null on failure. */
    const refreshAccounts = useCallback(async (type) => {
        try {
            const list = await SERVICES[type].getAccounts();
            setAccounts(prev => ({ ...prev, [type]: list }));
            if (list.length > 0) loadChats(type);
            else setChatsOf(type, []);
            return list;
        } catch {
            return null;
        }
    }, [loadChats, setChatsOf]);

    const disconnect = useCallback(async (type, accountId) => {
        await SERVICES[type].disconnect(accountId);
        return refreshAccounts(type);
    }, [refreshAccounts]);

    useEffect(() => { NETWORK_TYPES.forEach(refreshAccounts); }, [refreshAccounts]);

    const connectedTypes = NETWORK_TYPES.filter(type => accounts[type].length > 0);
    const connectedKey = connectedTypes.join(',');

    /**
     * One background pass over every connected network, each independent of the others. Passes
     * never overlap and a hidden tab makes none.
     */
    const poll = useCallback(async () => {
        if (pollInFlight.current || document.hidden || !connectedKey) return;
        pollInFlight.current = true;
        await Promise.allSettled(connectedKey.split(',').map(async (type) => {
            // Telegram without avatars: with them every refresh carried megabytes of base64
            // the list already had. New chats get theirs from the avatar effect below.
            const fresh = type === 'TELEGRAM'
                ? await telegramService.getChats(null, { avatars: false })
                : await SERVICES[type].getChats();
            notifyNew(type, chatsRef.current[type], fresh);
            setChatsOf(type, prev => merge(prev, fresh));
        }));
        pollInFlight.current = false;
    }, [connectedKey, setChatsOf]);

    useEffect(() => {
        if (!connectedKey) return undefined;
        const timer = setInterval(poll, CHAT_POLL_INTERVAL);
        // Coming back to the tab gets one immediate pass instead of up to a full interval
        // of a stale list.
        const onVisible = () => { if (!document.hidden) poll(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    }, [connectedKey, poll]);

    // Telegram avatars are fetched one chat at a time, once per chat per session, whichever
    // way the chat arrived. A chat with no photo at all is not asked again on every pass.
    useEffect(() => {
        chats.TELEGRAM.forEach(chat => {
            if (chat.avatarBase64 || avatarRequested.current.has(chat.externalChatId)) return;
            avatarRequested.current.add(chat.externalChatId);
            telegramService.getAvatar(chat.externalChatId)
                .then(r => {
                    if (!r?.avatar_base64) return;
                    setChatsOf('TELEGRAM', prev => prev.map(c => c.externalChatId === chat.externalChatId
                        ? { ...c, avatarBase64: r.avatar_base64 } : c));
                })
                .catch(() => { /* the initials stay */ });
        });
    }, [chats.TELEGRAM, setChatsOf]);

    return {
        accounts,
        chats,
        everyChat: NETWORK_TYPES.flatMap(type => chats[type]),
        connectedTypes,
        setChatsOf,
        loadChats,
        refreshAccounts,
        disconnect,
    };
}
