package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.dto.SendMediaRequest;
import com.vitalii.messenger_hub_backend.model.enums.MediaKind;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Covers the gate every outgoing attachment passes through: what is accepted, what is
 * rejected, and what is cleaned up on the way past.
 */
class MediaUploadValidatorTest {

    private static final long ONE_MB = 1_048_576L;

    private MediaUploadValidator validator;

    @BeforeEach
    void setUp() {
        validator = new MediaUploadValidator(ONE_MB);
    }

    private SendMediaRequest request(String base64, String mimeType, String fileName, MediaKind kind) {
        SendMediaRequest request = new SendMediaRequest();
        request.setChatId("42");
        request.setDataBase64(base64);
        request.setMimeType(mimeType);
        request.setFileName(fileName);
        request.setKind(kind);
        return request;
    }

    private static String base64Of(int bytes) {
        return Base64.getEncoder().encodeToString(new byte[bytes]);
    }

    @Test
    void acceptsAnOrdinaryAttachment() {
        MediaUploadValidator.ValidatedMedia media = validator.validate(
                request(base64Of(1024), "image/png", "photo.png", null));

        assertEquals("photo.png", media.fileName());
        assertEquals(MediaKind.IMAGE, media.kind(), "kind is inferred when the client omits it");
        assertTrue(media.approximateBytes() >= 1000 && media.approximateBytes() <= 1100);
    }

    /**
     * A recording and an audio file can be byte-identical; only the client knows the user
     * pressed a microphone. An explicit kind must therefore survive inference.
     */
    @Test
    void anExplicitKindIsNotOverriddenByTheMimeType() {
        MediaUploadValidator.ValidatedMedia media = validator.validate(
                request(base64Of(64), "audio/webm", null, MediaKind.VOICE));

        assertEquals(MediaKind.VOICE, media.kind());
        assertEquals("voice.webm", media.fileName());
    }

    /** FileReader hands back a full data URI; sending it verbatim would corrupt the file. */
    @Test
    void aDataUriPrefixIsStripped() {
        String payload = base64Of(32);

        MediaUploadValidator.ValidatedMedia media = validator.validate(
                request("data:audio/webm;base64," + payload, "audio/webm", null, MediaKind.VOICE));

        assertEquals(payload, media.base64());
    }

    @Test
    void oversizedUploadsAreRejected() {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> validator.validate(request(base64Of((int) ONE_MB + 1024), "image/png", "big.png", null)));

        assertTrue(error.getMessage().contains("завеликий"), error.getMessage());
    }

    @Test
    void emptyUploadsAreRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> validator.validate(request("", "image/png", "x.png", null)));
        assertThrows(IllegalArgumentException.class,
                () -> validator.validate(request(null, "image/png", "x.png", null)));
    }

    /**
     * The name reaches a filesystem inside some messenger libraries, so a path must not
     * survive it.
     */
    @Test
    void pathsInFileNamesAreStripped() {
        assertEquals("passwd", validator.validate(
                request(base64Of(16), "text/plain", "../../../etc/passwd", null)).fileName());

        assertEquals("notes.txt", validator.validate(
                request(base64Of(16), "text/plain", "C:\\Users\\Public\\notes.txt", null)).fileName());
    }

    @Test
    void aFileNameOfNothingButDotsFallsBackToADefault() {
        MediaUploadValidator.ValidatedMedia media = validator.validate(
                request(base64Of(16), "image/jpeg", "...", null));

        assertEquals("image.jpg", media.fileName());
    }

    @Test
    void anAbsentMimeTypeStillProducesAUsableAttachment() {
        MediaUploadValidator.ValidatedMedia media = validator.validate(
                request(base64Of(16), null, null, null));

        assertEquals("application/octet-stream", media.mimeType());
        assertEquals(MediaKind.FILE, media.kind());
        assertEquals("file.bin", media.fileName());
    }

    @Test
    void absurdDurationsAreClampedAndNegativesDropped() {
        SendMediaRequest tooLong = request(base64Of(16), "audio/ogg", null, MediaKind.VOICE);
        tooLong.setDurationSeconds(999_999);
        assertEquals(3600, validator.validate(tooLong).durationSeconds());

        SendMediaRequest negative = request(base64Of(16), "audio/ogg", null, MediaKind.VOICE);
        negative.setDurationSeconds(-5);
        assertNull(validator.validate(negative).durationSeconds());
    }

    @Test
    void thePayloadCarriesEverythingTheServicesNeed() {
        SendMediaRequest request = request(base64Of(16), "audio/ogg", null, MediaKind.VOICE);
        request.setDurationSeconds(7);
        request.setCaption("тест");

        var payload = validator.validate(request).toPayload();

        assertEquals("VOICE", payload.get("kind"));
        assertEquals(7, payload.get("duration_seconds"));
        assertEquals("тест", payload.get("caption"));
        assertEquals("voice.ogg", payload.get("file_name"));
        assertEquals("audio/ogg", payload.get("mime_type"));
        assertNotNull(payload.get("data_base64"));
    }
}
