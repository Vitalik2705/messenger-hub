package com.vitalii.messenger_hub_backend.model.enums;

/**
 * How far the model may go on the user's behalf in one chat. Set per chat only; OFF is the default.
 */
public enum AutoReplyMode {

    /** Nothing is generated for this chat. */
    OFF,

    /** A reply is written into the composer; the user decides whether to send it. */
    DRAFT,

    /** Sent, prefixed with a line saying it is an automatic reply. */
    AUTO_LABELED,

    /**
     * Sent as the user with no marking. Behind the same guards as the labelled mode: one chat at a
     * time, cooldown, daily cap.
     */
    AUTO
}
