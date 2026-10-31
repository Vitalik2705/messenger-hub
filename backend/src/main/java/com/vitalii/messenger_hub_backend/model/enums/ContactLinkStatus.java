package com.vitalii.messenger_hub_backend.model.enums;

/** The user's decision on a proposed link. REJECTED is kept so the pair is not proposed again. */
public enum ContactLinkStatus {
    PENDING,
    CONFIRMED,
    REJECTED
}
