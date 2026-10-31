package com.vitalii.messenger_hub_backend.model.enums;

/**
 * How far the model is allowed to go on the user's behalf in one chat.
 *
 * Set per chat and never globally: switching this on for everything at once is the one
 * mistake that cannot be undone message by message. OFF is the only default there can be.
 */
public enum AutoReplyMode {

    /** Nothing is generated for this chat. */
    OFF,

    /**
     * A reply is written and left in the composer. Nothing is sent, nothing leaves the
     * machine, and the user's Enter is what turns it into a message.
     */
    DRAFT,

    /**
     * Sent for real, prefixed with a line saying it is an automatic reply. The other side
     * is told what they are talking to, which is the difference between an away message
     * and an impersonation.
     */
    AUTO_LABELED,

    /**
     * Sent as the user, with nothing marking it as generated.
     *
     * The counterpart cannot tell, cannot ask, and did not agree. Kept behind the same
     * guards as the labelled mode — one chat at a time, cooldown, daily cap — because a
     * runaway loop here writes in someone's name.
     */
    AUTO
}
