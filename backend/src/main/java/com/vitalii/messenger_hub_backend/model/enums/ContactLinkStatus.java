package com.vitalii.messenger_hub_backend.model.enums;

/**
 * What the user has decided about a proposed link between two identities.
 *
 * REJECTED is kept rather than deleted on purpose: without it the matcher would propose the
 * same wrong pair again after every rescan.
 */
public enum ContactLinkStatus {
    PENDING,
    CONFIRMED,
    REJECTED
}
