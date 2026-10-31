package com.vitalii.messenger_hub_backend.model.dto;

import com.vitalii.messenger_hub_backend.model.enums.MediaKind;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * An attachment on its way out, as the browser sends it.
 *
 * Base64 rather than multipart so the whole chain — controller, service, microservice —
 * speaks the same JSON it already speaks everywhere else. The cost is a third more bytes
 * on the wire and the payload held in memory, which is why
 * {@link com.vitalii.messenger_hub_backend.service.MediaUploadValidator} caps the size.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendMediaRequest {

    private String chatId;

    /** Raw base64, no data: URI prefix — the validator strips one if the client sends it. */
    private String dataBase64;

    private String mimeType;

    private String fileName;

    /** What the user meant to send; inferred from the MIME type when absent. */
    private MediaKind kind;

    /** Voice and video notes only. Messengers show it before playback starts. */
    private Integer durationSeconds;

    /** Text sent alongside the attachment, where the messenger supports it. */
    private String caption;

    private String replyToMessageId;
}
