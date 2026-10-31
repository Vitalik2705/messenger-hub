package com.vitalii.messenger_hub_backend.model.enums;

/**
 * What is on the other side of a chat.
 *
 * The existing {@code chatType} only separates one-to-one from group, which puts a friend, a
 * news channel, a bot and Telegram's own notification account in the same bucket. That is the
 * difference the sidebar needs to filter on, and the one contact linking has to respect: two
 * accounts both showing the service chat "Telegram" are not a person seen twice.
 *
 * Every value here comes from what the messenger itself reports — Telegram's {@code bot},
 * {@code broadcast} and {@code megagroup} flags, Slack's {@code is_bot}, Discord's channel
 * type. It is metadata rather than inference, so it is exact and costs nothing.
 */
public enum ChatKind {

    /** A human being. The only kind worth proposing as a cross-messenger contact. */
    PERSON,

    /** An automated account. Telegram's `bot` flag, Slack's `is_bot`. */
    BOT,

    /** Broadcast-only: a Telegram channel, a Discord announcement channel. */
    CHANNEL,

    /** A conversation among several people. */
    GROUP,

    /** The messenger talking to itself — login codes, notices. Telegram's account 777000. */
    SERVICE;

    /**
     * Reads the kind a messenger service reported.
     *
     * A service that predates this field, or that cannot tell (WhatsApp exposes no bot flag),
     * falls back to the coarse chat type — which is exactly the old behaviour, so an
     * un-upgraded service keeps working rather than losing its chats.
     */
    public static ChatKind parse(String reported, String chatType) {
        if (reported != null) {
            for (ChatKind kind : values()) {
                if (kind.name().equalsIgnoreCase(reported)) return kind;
            }
        }
        return "GROUP".equalsIgnoreCase(chatType) ? GROUP : PERSON;
    }
}
