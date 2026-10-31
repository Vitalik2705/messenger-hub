package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.dto.MessageSearchResultDTO;
import com.vitalii.messenger_hub_backend.model.entity.Message;
import com.vitalii.messenger_hub_backend.model.entity.MessageEmbedding;
import com.vitalii.messenger_hub_backend.repository.MessageEmbeddingRepository;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Search by meaning, entirely local: "де ми домовлялись про оренду" finds "квартиру беремо з
 * понеділка".
 *
 * No vector database: one person's archive is tens of thousands of messages, and a full cosine scan
 * over in-memory float arrays takes about a millisecond.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SemanticSearchService {

    /** Below this a message carries no meaning worth a vector: "ок", "+", a lone emoji. */
    private static final int MIN_CHARS = 20;

    private final MessageEmbeddingRepository embeddingRepository;
    private final MessageRepository messageRepository;
    private final OllamaClient ollama;
    private final BackgroundWorkGate gate;
    private final JdbcTemplate jdbcTemplate;

    @Value("${embeddings.model:bge-m3}")
    private String model;

    @Value("${embeddings.enabled:true}")
    private boolean enabled;

    /** How many messages one indexing tick embeds. */
    @Value("${embeddings.batch-size:64}")
    private int batchSize;

    /** The in-memory index per user, built on first search and appended to as indexing proceeds. */
    private final Map<Long, Index> indexes = new ConcurrentHashMap<>();

    private static final class Index {
        final List<long[]> ids = new ArrayList<>();     // {embeddingId, messageId, chatId}
        final List<float[]> vectors = new ArrayList<>();
        long lastEmbeddingId = 0;
    }

    public record Hit(Long messageId, Long chatId, double score) {}

    public record Status(boolean available, String model, long indexed, long pending) {}

    // ── Indexing ──────────────────────────────────────────────────────────────

    /**
     * Drops vectors made by other models at startup. A message holds one vector (unique on
     * message_id) and vectors of different models are not comparable, so after a model switch the
     * old ones would block re-indexing.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void dropVectorsOfOtherModels() {
        if (!enabled) return;
        try {
            // One statement, so rows and their bytes go together. The vector is a Postgres
            // large object; deleting the row alone would leave its bytes behind.
            int dropped = jdbcTemplate.queryForList(
                    "DELETE FROM message_embeddings WHERE model <> ? RETURNING lo_unlink(vector)",
                    model).size();
            if (dropped > 0) {
                log.info("Dropped {} vector(s) of other models; re-indexing with {}", dropped, model);
            }
        } catch (Exception e) {
            log.warn("Could not drop vectors of other models: {}", e.getMessage());
        }
    }

    /**
     * Embeds a slice of the backlog on a schedule, a little at a time, so indexing never saturates
     * the CPU.
     */
    @Scheduled(fixedDelayString = "${embeddings.interval-ms:120000}",
            initialDelayString = "${embeddings.initial-delay-ms:120000}")
    public void scheduledIndex() {
        gate.runIfIdle("embedding", this::indexBacklog);
    }

    public void indexBacklog() {
        if (!enabled) return;
        List<Long> users;
        try {
            users = embeddingRepository.findUsersWithBacklog(model, MIN_CHARS);
        } catch (Exception e) {
            log.debug("Embedding backlog query failed: {}", e.getMessage());
            return;
        }
        if (users.isEmpty()) return;

        for (Long userId : users) {
            try {
                // Batch after batch while nobody is using the application: one batch per
                // tick would take hours over a fresh archive or after a model change. The
                // moment the user is back, this stops after the batch in hand.
                int done = 0;
                int batch;
                do {
                    batch = indexUser(userId, batchSize);
                    done += batch;
                } while (batch == batchSize && !gate.userIsActive());
                if (done > 0) log.info("Embedded {} message(s) for user {}", done, userId);
            } catch (OllamaClient.OllamaUnavailableException e) {
                // Ollama is a process the user controls; stopping quietly and retrying on the
                // next tick is the correct behaviour, not an error to escalate.
                log.debug("Embedding paused: {}", e.getMessage());
                return;
            } catch (Exception e) {
                log.warn("Embedding failed for user {}: {}", userId, e.getMessage());
            }
        }
    }

    @Transactional
    public int indexUser(Long userId, int limit) {
        List<Object[]> rows = embeddingRepository.findUnindexed(userId, model, MIN_CHARS, limit);
        if (rows.isEmpty()) return 0;

        List<String> texts = new ArrayList<>(rows.size());
        for (Object[] row : rows) texts.add((String) row[1]);

        List<float[]> vectors = ollama.embed(model, texts);
        if (vectors.size() != rows.size()) {
            log.warn("Embedding count mismatch: asked {}, got {}", rows.size(), vectors.size());
            return 0;
        }

        List<MessageEmbedding> saved = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            Object[] row = rows.get(i);
            float[] vector = vectors.get(i);
            saved.add(MessageEmbedding.builder()
                    .messageId(((Number) row[0]).longValue())
                    .chatId(((Number) row[2]).longValue())
                    .userId(userId)
                    .model(model)
                    .dim(vector.length)
                    .vector(pack(vector))
                    .build());
        }
        embeddingRepository.saveAll(saved);
        // The in-memory index picks these up on the next search rather than being mutated
        // from a background thread mid-query.
        return saved.size();
    }

    // ── Searching ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Status status(Long userId) {
        long indexed = embeddingRepository.countByUserIdAndModel(userId, model);
        long pending = embeddingRepository.findUnindexed(userId, model, MIN_CHARS, 1000).size();
        return new Status(ollama.isReachable(), model, indexed, pending);
    }

    /**
     * The nearest messages by meaning, best first: brute-force cosine similarity, which at this
     * scale is the simplest and fastest correct answer.
     */
    @Transactional(readOnly = true)
    public List<MessageSearchResultDTO> search(Long userId, String query, int limit) {
        if (query == null || query.isBlank()) return List.of();

        Index index = refresh(userId);
        if (index.vectors.isEmpty()) return List.of();

        List<float[]> queryVectors = ollama.embed(model, List.of(query));
        if (queryVectors.isEmpty()) return List.of();
        float[] needle = normalise(queryVectors.get(0));

        PriorityQueue<Hit> best = new PriorityQueue<>(Comparator.comparingDouble(Hit::score));
        // Under the same lock refresh() appends with: a second search by the same user can
        // grow these lists mid-scan, and ArrayList gives no guarantees to a reader racing a
        // writer. The scan is milliseconds; the embedding call above stays outside the lock.
        synchronized (index) {
            for (int i = 0; i < index.vectors.size(); i++) {
                double score = dot(needle, index.vectors.get(i));
                if (best.size() < limit) {
                    best.add(new Hit(index.ids.get(i)[1], index.ids.get(i)[2], score));
                } else if (score > best.peek().score()) {
                    best.poll();
                    best.add(new Hit(index.ids.get(i)[1], index.ids.get(i)[2], score));
                }
            }
        }

        List<Hit> hits = new ArrayList<>(best);
        hits.sort(Comparator.comparingDouble(Hit::score).reversed());
        return hydrate(hits);
    }

    /** Turns hits into something readable, in one query rather than one per hit. */
    private List<MessageSearchResultDTO> hydrate(List<Hit> hits) {
        if (hits.isEmpty()) return List.of();
        Map<Long, Double> scores = new LinkedHashMap<>();
        hits.forEach(hit -> scores.put(hit.messageId(), hit.score()));

        List<Message> messages = messageRepository.findAllById(scores.keySet());
        Map<Long, Message> byId = new HashMap<>();
        messages.forEach(message -> byId.put(message.getId(), message));

        List<MessageSearchResultDTO> results = new ArrayList<>();
        for (Map.Entry<Long, Double> entry : scores.entrySet()) {
            Message message = byId.get(entry.getKey());
            if (message == null) continue;
            results.add(MessageSearchResultDTO.builder()
                    .messageId(message.getId())
                    .chatId(message.getChat().getId())
                    .chatName(message.getChat().getName())
                    .messengerType(message.getChat().getMessengerAccount().getMessengerType().name())
                    .senderName(message.getSenderName())
                    .isFromUser(message.getIsFromUser())
                    .timestamp(message.getTimestamp())
                    .text(message.getText())
                    // No snippet: nothing was matched literally, so there is nothing to
                    // highlight. Marking words that were never searched for would be a lie
                    // about how the result was found.
                    .snippet(null)
                    .rank(entry.getValue())
                    .build());
        }
        return results;
    }

    /** Loads what is missing rather than rebuilding — the index only ever grows. */
    private Index refresh(Long userId) {
        Index index = indexes.computeIfAbsent(userId, id -> new Index());
        synchronized (index) {
            List<MessageEmbedding> fresh = index.lastEmbeddingId == 0
                    ? embeddingRepository.findByUserIdAndModel(userId, model)
                    : embeddingRepository.findNewer(userId, model, index.lastEmbeddingId);
            for (MessageEmbedding embedding : fresh) {
                index.ids.add(new long[]{embedding.getId(), embedding.getMessageId(), embedding.getChatId()});
                // Stored normalised, so a search is a dot product rather than a division
                // per candidate.
                index.vectors.add(normalise(unpack(embedding.getVector())));
                index.lastEmbeddingId = Math.max(index.lastEmbeddingId, embedding.getId());
            }
            return index;
        }
    }

    // ── Vector plumbing ───────────────────────────────────────────────────────

    static byte[] pack(float[] vector) {
        ByteBuffer buffer = ByteBuffer.allocate(vector.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float value : vector) buffer.putFloat(value);
        return buffer.array();
    }

    static float[] unpack(byte[] bytes) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        float[] vector = new float[bytes.length / 4];
        for (int i = 0; i < vector.length; i++) vector[i] = buffer.getFloat();
        return vector;
    }

    static float[] normalise(float[] vector) {
        double sum = 0;
        for (float value : vector) sum += value * value;
        double length = Math.sqrt(sum);
        if (length == 0) return vector;
        float[] unit = new float[vector.length];
        for (int i = 0; i < vector.length; i++) unit[i] = (float) (vector[i] / length);
        return unit;
    }

    /** Both sides are unit vectors, so this is already the cosine. */
    static double dot(float[] a, float[] b) {
        int n = Math.min(a.length, b.length);
        double sum = 0;
        for (int i = 0; i < n; i++) sum += a[i] * b[i];
        return sum;
    }
}
