package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.entity.AnalysisBatch;
import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.model.enums.*;
import com.vitalii.messenger_hub_backend.repository.AnalysisBatchRepository;
import com.vitalii.messenger_hub_backend.repository.AnalysisRunRepository;
import com.vitalii.messenger_hub_backend.repository.ChatRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Scans every chat cheaply, ranks them, and spends the model only on the top.
 *
 * This is the cascade the metrics layer exists for. Arithmetic over an archive of fifty
 * conversations costs milliseconds; a 7B model reading the same fifty on a CPU would take
 * the better part of an hour. So the arithmetic runs everywhere and answers the question
 * "which of these deserves an hour's worth of attention" — then the model reads three.
 *
 * The saving is not incidental. Without a filter this feature is impossible on this
 * hardware; with one it takes two minutes.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BatchAnalysisService {

    /** Never queue more model runs than this, whatever the request asks for. */
    public static final int MAX_TOP_N = 10;

    /** Every metric is computed during a scan — they are nearly free and the table shows them. */
    private static final Set<AnalysisMetric> ALL_METRICS = EnumSet.allOf(AnalysisMetric.class);

    private final ChatRepository chatRepository;
    private final AnalysisBatchRepository batchRepository;
    private final AnalysisRunRepository runRepository;
    private final ChatMetricsService metricsService;
    private final ChatAnalysisService analysisService;
    private final UserService userService;
    private final ApplicationEventPublisher events;

    /** Carries a queued batch to the worker once its row is committed. */
    public record BatchRequested(Long batchId) {}

    public record BatchRequest(BatchRanking ranking, boolean peopleOnly, Integer minMessages,
                               Integer topN, String model, List<Long> promptIds,
                               boolean includeSummary, Integer messageLimit) {}

    @Transactional
    public AnalysisBatch request(String email, BatchRequest request) {
        User user = userService.findByEmail(email);
        AnalysisBatch batch = batchRepository.save(AnalysisBatch.builder()
                .user(user)
                .status(AnalysisStatus.PENDING)
                .ranking(request.ranking() == null ? BatchRanking.UNANSWERED : request.ranking())
                .peopleOnly(request.peopleOnly())
                .minMessages(request.minMessages() == null ? 10 : Math.max(1, request.minMessages()))
                .modelTopN(request.model() == null || request.model().isBlank() ? 0
                        : Math.max(0, Math.min(request.topN() == null ? 3 : request.topN(), MAX_TOP_N)))
                .model(request.model() == null || request.model().isBlank() ? null : request.model())
                .build());

        events.publishEvent(new BatchRequested(batch.getId()));
        // Held on the batch only for the worker's benefit; the runs it queues carry their own.
        pending.put(batch.getId(), request);
        return batch;
    }

    /**
     * Settings that outlive the request but not the process.
     *
     * The prompts and message limit belong to the runs the batch will queue, not to the
     * batch itself, and adding four columns to store them for the seconds between queueing
     * and running would be storage pretending to be state.
     */
    private final Map<Long, BatchRequest> pending = new HashMap<>();

    /**
     * Runs the sweep: measure everything, rank it, queue the model on the top few.
     *
     * Not transactional, and metrics are computed one chat at a time through a service that
     * opens its own read transaction. Fifty chats is fifty short reads rather than one long
     * one holding a connection for the duration.
     */
    public void execute(Long batchId) {
        BatchRequest request = pending.remove(batchId);
        AnalysisBatch batch;
        try {
            batch = markRunning(batchId);
        } catch (Exception e) {
            // Anything thrown before the try below used to escape into the async handler and
            // leave the row RUNNING for ever: the page then spun with nothing to wait for.
            log.warn("Batch {} could not start: {}", batchId, e.getMessage(), e);
            finish(batchId, null, 0, "Пакетний аналіз не стартував: " + e.getMessage());
            return;
        }
        if (batch == null) return;

        try {
            Long userId = batchRepository.findOwnerId(batchId);
            List<Chat> chats = batch.getPeopleOnly() != null && batch.getPeopleOnly()
                    ? chatRepository.findPersonalChats(userId).stream()
                    .filter(chat -> chat.getChatKind() == null || chat.getChatKind() == ChatKind.PERSON)
                    .toList()
                    : chatRepository.findByUserIdOrderByLastMessageAtDesc(userId).stream()
                    .filter(chat -> chat.getChatKind() != ChatKind.SERVICE)
                    .toList();

            BatchRanking ranking = batch.getRanking();
            List<Map<String, Object>> rows = new ArrayList<>();

            for (Chat chat : chats) {
                ChatMetricsService.Metrics metrics = metricsService.compute(chat.getId(), ALL_METRICS);
                if (metrics.messageCount() < batch.getMinMessages()) continue;

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("chatId", chat.getId());
                row.put("chatName", chat.getName());
                row.put("messengerType", chat.getMessengerAccount().getMessengerType().name());
                row.put("messages", metrics.messageCount());
                row.put("score", ranking.score(metrics.values()));
                row.put("metrics", metrics.values());
                rows.add(row);
            }

            // Chats that cannot answer this question are kept in the table but sorted to the
            // bottom: dropping them would hide that they were scanned at all.
            rows.sort((a, b) -> {
                Double sa = (Double) a.get("score");
                Double sb = (Double) b.get("score");
                if (sa == null && sb == null) return 0;
                if (sa == null) return 1;
                if (sb == null) return -1;
                return Double.compare(sb, sa);
            });

            int topN = batch.getModelTopN() == null ? 0 : batch.getModelTopN();
            List<Long> queued = new ArrayList<>();
            if (topN > 0 && batch.getModel() != null && request != null) {
                String owner = batchRepository.findOwnerEmail(batchId);
                for (Map<String, Object> row : rows) {
                    if (queued.size() >= topN) break;
                    // Only chats the ranking could actually score: spending a minute of
                    // inference on a chat that placed by default is the waste this exists
                    // to prevent.
                    if (row.get("score") == null) continue;
                    Long chatId = (Long) row.get("chatId");
                    var run = analysisService.request(
                            owner, chatId, Set.of(),
                            batch.getModel(), request.messageLimit(),
                            request.includeSummary(), request.promptIds());
                    tagWithBatch(run.getId(), batchId);
                    row.put("runId", run.getId());
                    queued.add(run.getId());
                }
            }

            finish(batchId, ChatAnalysisService.writeJson(rows), rows.size(), null);
            log.info("Batch {} scanned {} chats, queued {} model run(s)",
                    batchId, rows.size(), queued.size());
        } catch (Exception e) {
            log.warn("Batch {} failed: {}", batchId, e.getMessage(), e);
            finish(batchId, null, 0, "Пакетний аналіз не вдався: " + e.getMessage());
        }
    }

    // ── Persistence steps ─────────────────────────────────────────────────────

    @Transactional
    public AnalysisBatch markRunning(Long batchId) {
        AnalysisBatch batch = batchRepository.findById(batchId).orElse(null);
        if (batch == null) return null;
        batch.setStatus(AnalysisStatus.RUNNING);
        batchRepository.save(batch);
        // No touch of the lazy user here. execute() calls this method from inside the same
        // class, so the call never goes through the Spring proxy and @Transactional does not
        // apply: the entity comes back detached, and initialising an association on it throws
        // LazyInitializationException. Only the id is needed downstream, and Hibernate answers
        // that from the proxy itself, without a session.
        return batch;
    }

    @Transactional
    public void tagWithBatch(Long runId, Long batchId) {
        runRepository.findById(runId).ifPresent(run -> {
            run.setBatchId(batchId);
            runRepository.save(run);
        });
    }

    @Transactional
    public void finish(Long batchId, String tableJson, int scanned, String error) {
        batchRepository.findById(batchId).ifPresent(batch -> {
            batch.setTableJson(tableJson);
            batch.setScannedCount(scanned);
            batch.setError(error);
            batch.setFinishedAt(LocalDateTime.now());
            batch.setStatus(tableJson == null ? AnalysisStatus.FAILED : AnalysisStatus.DONE);
            batchRepository.save(batch);
        });
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AnalysisBatch> history(String email) {
        return batchRepository.findTop30ByUserIdOrderByCreatedAtDesc(
                userService.findByEmail(email).getId());
    }

    @Transactional(readOnly = true)
    public AnalysisBatch one(String email, Long batchId) {
        Long userId = userService.findByEmail(email).getId();
        AnalysisBatch batch = batchRepository.findById(batchId)
                .orElseThrow(() -> new CustomException("Пакет не знайдено", HttpStatus.NOT_FOUND));
        if (!batch.getUser().getId().equals(userId)) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }
        return batch;
    }

    @Transactional
    public void delete(String email, Long batchId) {
        batchRepository.delete(one(email, batchId));
    }
}
