package com.vitalii.messenger_hub_backend.model.enums;

/**
 * What an outgoing attachment is meant to be. VOICE exists because a voice note and an audio file
 * can be byte-identical, yet messengers render them differently; only the client knows which was
 * intended.
 */
public enum MediaKind {
    VOICE,
    IMAGE,
    VIDEO,
    AUDIO,
    FILE;

    /** Best guess for an attachment the user picked from disk rather than recorded. */
    public static MediaKind fromMimeType(String mimeType) {
        if (mimeType == null) return FILE;
        String type = mimeType.toLowerCase();
        if (type.startsWith("image/")) return IMAGE;
        if (type.startsWith("video/")) return VIDEO;
        if (type.startsWith("audio/")) return AUDIO;
        return FILE;
    }
}
