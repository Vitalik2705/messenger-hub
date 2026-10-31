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
import org.springframework.transaction.annotation.Transactional;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Search by meaning rather than by word, entirely on this machine.
 *
 * Full-text search finds the messages that used the words you typed. This finds the ones
 * that meant what you meant — "де ми домовлялись про оренду" reaches a message that said
 * "квартиру беремо з понеділка" and never used either word.
 *
 * There is no vector database here and none is needed. pgvector exists to make approximate
 * search fast at millions of rows; one person's archive is tens of thousands, and a full
 * scan over that is a few million multiply-adds — around a millisecond. The index is kept
 * in memory as packed float arrays, topped up rather than rebuilt, and the whole thing is
 * smaller than a single chat's photos.
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

    @Value("${embeddings.model:nomic-embed-text}")
    private String model;

    @Value("${embeddings.enabled:true}")
    private boolean enabled;

    /** How many messages one indexing tick embeds. */
    @Value("${embeddings.batch-size:64}")
    private int batchSize;

    /**
     * The searchable index, per user.
     *
     * Held in memory because the alternative is reading every vector out of the database on
     * every keystroke — tens of megabytes for a query that should take a millisecond. Built
     * lazily on first search and appended to as indexing proceeds, so it is never rebuilt
     * from scratch after the first time.
     */
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
     * Embeds a slice of the backlog.
     *
     * Runs on a schedule and does a little at a time, exactly like the message archiver:
     * embedding is CPU work competing with everything else the model does, and a burst that
     * indexes ten thousand messages at once would make the application unusable while it
     * ran. A first index of a large archive therefore takes a while — and finishes.
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
                int done = indexUser(userId, batchSize);
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
     * The nearest messages by meaning, best first.
     *
     * Cosine similarity over every vector the user has. Brute force is not a shortcut here —
     * at this scale it is both the simplest and the fastest correct answer, and it has no
     * index to build, tune, or keep in step with new messages.
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
        for (int i = 0; i < index.vectors.size(); i++) {
            double score = dot(needle, index.vectors.get(i));
            if (best.size() < limit) {
                best.add(new Hit(index.ids.get(i)[1], index.ids.get(i)[2], score));
            } else if (score > best.peek().score()) {
                best.poll();
                best.add(new Hit(index.ids.get(i)[1], index.ids.get(i)[2], score));
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
