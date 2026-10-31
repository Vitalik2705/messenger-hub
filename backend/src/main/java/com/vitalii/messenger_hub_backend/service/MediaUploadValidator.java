package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.dto.SendMediaRequest;
import com.vitalii.messenger_hub_backend.model.enums.MediaKind;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Checks an outgoing attachment before it reaches a messenger.
 *
 * The backend is a pass-through here: it never decodes the payload. Size is judged from the
 * base64 length instead, which is exact enough — decoding a 20 MB upload just to measure it
 * would double the memory cost of every send for no added certainty.
 */
@Component
@Slf4j
public class MediaUploadValidator {

    /** Base64 carries 3 bytes in every 4 characters. */
    private static final double BASE64_RATIO = 3.0 / 4.0;

    private static final String DEFAULT_MIME = "application/octet-stream";

    /** Longer than any messenger will accept as a single voice note. */
    private static final int MAX_DURATION_SECONDS = 60 * 60;

    private final long maxBytes;

    public MediaUploadValidator(@Value("${media.upload.max-bytes:20971520}") long maxBytes) {
        this.maxBytes = maxBytes;
    }

    /**
     * A validated attachment, ready to forward. Immutable and already normalised, so no
     * messenger service has to repeat any of this.
     */
    public record ValidatedMedia(String base64, String mimeType, String fileName,
                                 MediaKind kind, Integer durationSeconds,
                                 String caption, String replyToMessageId,
                                 long approximateBytes) {

        /** What the microservices expect, in the shape they all agree on. */
        public Map<String, Object> toPayload() {
            Map<String, Object> payload = new HashMap<>();
            payload.put("data_base64", base64);
            payload.put("mime_type", mimeType);
            payload.put("file_name", fileName);
            payload.put("kind", kind.name());
            payload.put("duration_seconds", durationSeconds);
            payload.put("caption", caption);
            return payload;
        }
    }

    public ValidatedMedia validate(SendMediaRequest request) {
        if (request == null || request.getDataBase64() == null || request.getDataBase64().isBlank()) {
            throw new IllegalArgumentException("Порожнє вкладення");
        }

        String base64 = stripDataUri(request.getDataBase64().trim());
        long approximateBytes = (long) (base64.length() * BASE64_RATIO);
        if (approximateBytes > maxBytes) {
            throw new IllegalArgumentException(
                    "Файл завеликий: %d МБ, максимум %d МБ"
                            .formatted(approximateBytes / 1_048_576, maxBytes / 1_048_576));
        }

        String mimeType = (request.getMimeType() == null || request.getMimeType().isBlank())
                ? DEFAULT_MIME
                : request.getMimeType().trim();

        MediaKind kind = request.getKind() != null
                ? request.getKind()
                : MediaKind.fromMimeType(mimeType);

        return new ValidatedMedia(
                base64,
                mimeType,
                safeFileName(request.getFileName(), kind, mimeType),
                kind,
                clampDuration(request.getDurationSeconds()),
                request.getCaption(),
                request.getReplyToMessageId(),
                approximateBytes);
    }

    /**
     * Browsers hand back recordings as "data:audio/webm;base64,GkXf..." when the client
     * uses a FileReader. Accepting both shapes costs one line and removes a failure mode
     * that would otherwise surface as a corrupt file at the far end.
     */
    private String stripDataUri(String value) {
        int marker = value.indexOf("base64,");
        return marker < 0 ? value : value.substring(marker + "base64,".length());
    }

    /**
     * A file name from the client reaches a filesystem in some messenger libraries, so path
     * separators and traversal segments are removed rather than trusted.
     */
    private String safeFileName(String raw, MediaKind kind, String mimeType) {
        if (raw == null || raw.isBlank()) return defaultFileName(kind, mimeType);

        String name = raw.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        name = name.replaceAll("[\\p{Cntrl}]", "").trim();
        while (name.startsWith(".")) name = name.substring(1);

        if (name.isBlank()) return defaultFileName(kind, mimeType);
        return name.length() > 200 ? name.substring(0, 200) : name;
    }

    private String defaultFileName(MediaKind kind, String mimeType) {
        String extension = switch (mimeType.split(";")[0].toLowerCase()) {
            case "audio/ogg", "audio/opus" -> "ogg";
            case "audio/webm" -> "webm";
            case "audio/mpeg" -> "mp3";
            case "audio/mp4", "audio/x-m4a" -> "m4a";
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            case "image/gif" -> "gif";
            case "image/webp" -> "webp";
            case "video/mp4" -> "mp4";
            case "video/webm" -> "webm";
            default -> "bin";
        };
        String stem = kind == MediaKind.VOICE ? "voice" : kind.name().toLowerCase();
        return stem + "." + extension;
    }

    private Integer clampDuration(Integer seconds) {
        if (seconds == null || seconds < 0) return null;
        return Math.min(seconds, MAX_DURATION_SECONDS);
    }
}
