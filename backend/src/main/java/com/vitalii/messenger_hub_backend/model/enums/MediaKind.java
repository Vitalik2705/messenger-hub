package com.vitalii.messenger_hub_backend.model.enums;

/**
 * What an outgoing attachment is meant to be, which is not always what its MIME type says.
 *
 * VOICE is the reason this exists. A voice note and an audio file can carry byte-identical
 * content; the difference is that the sender pressed a microphone button, and every
 * messenger renders the two differently. Only the client knows which happened, so the
 * intent travels with the upload instead of being guessed from the bytes.
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
