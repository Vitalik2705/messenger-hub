package com.vitalii.messenger_hub_backend.model.enums;

/**
 * What became of a generated reply.
 *
 * This is the measurement the whole feature rests on: a suggestion nobody sends is a
 * suggestion that failed, and only the outcome distinguishes the two. SENT versus
 * SENT_EDITED versus REJECTED is the acceptance rate, on real conversations.
 */
public enum DraftStatus {
    /** Waiting in the composer. */
    PENDING,
    /** Sent exactly as generated. */
    SENT,
    /** Sent after the user changed the wording. */
    SENT_EDITED,
    /** Dismissed without sending. */
    REJECTED,
    /** Sent by the system itself, in one of the automatic modes. */
    AUTO_SENT
}
