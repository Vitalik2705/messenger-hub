package com.vitalii.messenger_hub_backend.model.enums;

/**
 * What is on the other side of a chat. chatType only separates one-to-one from group; this
 * separates people, bots, channels, groups and service accounts, from what the messenger reports
 * (Telegram's bot/broadcast/megagroup flags, Slack's is_bot, Discord's channel type).
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
     * Parses the kind a service reported, falling back to the coarse chat type when it reports none
     * (e.g. WhatsApp, which has no bot flag).
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
