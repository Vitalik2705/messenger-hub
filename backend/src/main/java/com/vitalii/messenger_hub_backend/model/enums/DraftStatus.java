package com.vitalii.messenger_hub_backend.model.enums;

/** What became of a generated reply. SENT vs SENT_EDITED vs REJECTED is the acceptance rate. */
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
