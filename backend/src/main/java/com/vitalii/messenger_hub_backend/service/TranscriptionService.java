package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.Message;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Turns voice messages into text, so search, metrics and the model can use them. The audio is
 * fetched from the messenger, transcribed and discarded; only the text is stored.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TranscriptionService {

    private final MessageRepository messageRepository;
    private final TelegramService telegramService;
    private final MessengerAccountLookup accounts;
    private final BackgroundWorkGate gate;

    @Value("${whisper.url:http://localhost:8206}")
    private String whisperUrl;

    @Value("${whisper.enabled:true}")
    private boolean enabled;

    /**
     * Whether a timer works through the backlog. Off by default: transcription takes about as long
     * as the clip and competes with the open chat for the messenger connection.
     */
    @Value("${whisper.background:false}")
    private boolean backgroundEnabled;

    /** How many clips one tick transcribes. Small: this competes with everything else. */
    @Value("${whisper.batch-size:5}")
    private int batchSize;

    @Value("${whisper.language:uk}")
    private String language;

    private RestTemplate restTemplate;

    private RestTemplate client() {
        if (restTemplate == null) {
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(Duration.ofSeconds(3));
            // A minute of audio takes tens of seconds on a CPU, and the first request also
            // waits for the model to load.
            factory.setReadTimeout(Duration.ofMinutes(5));
            restTemplate = new RestTemplate(factory);
        }
        return restTemplate;
    }

    public record Status(boolean available, String model, long voiceMessages, long transcribed) {}

    @Scheduled(fixedDelayString = "${whisper.interval-ms:600000}",
            initialDelayString = "${whisper.initial-delay-ms:300000}")
    public void scheduledBacklog() {
        if (!enabled || !backgroundEnabled) return;
        // Even when switched on, it yields: to the user, and to the other background jobs.
        gate.runIfIdle("transcription", this::transcribeBacklog);
    }

    public void transcribeBacklog() {
        if (!enabled) return;

        List<Object[]> rows;
        try {
            rows = messageRepository.findUntranscribedVoice(batchSize);
        } catch (Exception e) {
            log.debug("Transcription backlog query failed: {}", e.getMessage());
            return;
        }
        if (rows.isEmpty()) return;

        if (!isReachable()) {
            log.debug("Whisper service not reachable at {} — retrying later", whisperUrl);
            return;
        }

        for (Object[] row : rows) {
            Long messageId = ((Number) row[0]).longValue();
            String externalMessageId = (String) row[1];
            String externalChatId = (String) row[2];
            Long accountId = ((Number) row[3]).longValue();
            try {
                transcribeOne(messageId, externalMessageId, externalChatId, accountId);
            } catch (Exception e) {
                log.warn("Transcription failed for message {}: {}", messageId, e.getMessage());
                mark(messageId, null, "FAILED");
            }
        }
    }

    /**
     * Transcribes one message on request and returns the text, through the same path as the
     * background job.
     */
    /** Same as below, addressed the way the client can address it. */
    public String transcribeMessage(Long userId, Long accountId,
                                    String externalChatId, String externalMessageId) {
        Long messageId = messageRepository.findIdByExternalIds(accountId, externalChatId, externalMessageId);
        if (messageId == null) {
            // The chat has been opened but this message has not reached the archive yet;
            // the background archiver will pick it up within the next few minutes.
            throw new IllegalStateException("Це повідомлення ще не потрапило в локальний архів");
        }
        return transcribeMessage(userId, messageId);
    }

    // Deliberately not @Transactional: a read-only transaction here swallowed the write in
    // mark() (Hibernate never flushes it), and it would hold a connection for the whole
    // download and transcription. Each repository call commits on its own.
    public String transcribeMessage(Long userId, Long messageId) {
        List<Object[]> route = messageRepository.findMediaRoute(messageId);
        if (route.isEmpty()) throw new IllegalArgumentException("Повідомлення не знайдено");

        Object[] row = route.get(0);
        Long owner = ((Number) row[3]).longValue();
        if (!owner.equals(userId)) throw new SecurityException("Access denied");

        String existing = (String) row[5];
        if (existing != null && !existing.isBlank()) return existing;

        if (!"TELEGRAM".equals(String.valueOf(row[4]))) {
            throw new UnsupportedOperationException(
                    "Розшифровка поки що працює лише для Telegram");
        }

        return transcribeOne(messageId, (String) row[0], (String) row[1], ((Number) row[2]).longValue());
    }

    /** Returns the transcript, or null when there is nothing to read. */
    @SuppressWarnings("unchecked")
    private String transcribeOne(Long messageId, String externalMessageId,
                               String externalChatId, Long accountId) {
        Long userId = accounts.ownerOf(accountId);
        if (userId == null) {
            mark(messageId, null, "SKIPPED");
            return null;
        }

        Map<String, Object> media = telegramService.getMessageMedia(
                userId, externalChatId, externalMessageId, accountId);
        String base64 = media == null ? null : (String) media.get("media_base64");
        if (base64 == null || base64.isBlank()) {
            // The clip is gone from the messenger, or was never audio. Marked so the job
            // does not come back to it every two minutes forever.
            mark(messageId, null, "SKIPPED");
            return null;
        }

        Map<String, Object> request = Map.of(
                "audio_base64", base64,
                "mime", media.getOrDefault("media_mime", "audio/ogg"),
                "language", language);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<Map> response = client().postForEntity(
                whisperUrl + "/transcribe", new HttpEntity<>(request, headers), Map.class);
        Map<String, Object> body = response.getBody();
        String text = body == null ? null : (String) body.get("text");

        if (text == null || text.isBlank()) {
            // Silence, or speech the model could not make out. Recorded as done rather than
            // failed: retrying will produce the same nothing.
            mark(messageId, null, "DONE");
            return null;
        }

        mark(messageId, text.trim(), "DONE");
        log.info("Transcribed message {} ({}s audio in {}s)",
                messageId, body.get("duration"), body.get("took_seconds"));
        return text.trim();
    }

    @Transactional
    public void mark(Long messageId, String transcript, String status) {
        messageRepository.findById(messageId).ifPresent(message -> {
            message.setTranscript(transcript);
            message.setTranscriptStatus(status);
            messageRepository.save(message);
        });
    }

    public boolean isReachable() {
        try {
            client().getForEntity(whisperUrl + "/health", String.class);
            return true;
        } catch (ResourceAccessException e) {
            return false;
        } catch (Exception e) {
            return true; // answered something, so it is up
        }
    }

    @Transactional(readOnly = true)
    public Status status(Long userId) {
        String model = "—";
        try {
            ResponseEntity<Map> health = client().getForEntity(whisperUrl + "/health", Map.class);
            if (health.getBody() != null) model = String.valueOf(health.getBody().get("model"));
        } catch (Exception ignored) { /* reported as unavailable below */ }

        return new Status(isReachable(), model,
                messageRepository.countVoiceMessages(userId),
                messageRepository.countTranscribed(userId));
    }

    /** Reads a message's transcript, if it has one. */
    @Transactional(readOnly = true)
    public String transcriptOf(Long messageId) {
        return messageRepository.findById(messageId).map(Message::getTranscript).orElse(null);
    }
}
