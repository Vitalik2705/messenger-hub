package com.vitalii.messenger_hub_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.entity.AnalysisPrompt;
import com.vitalii.messenger_hub_backend.model.entity.AnalysisRun;
import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.enums.AnalysisMetric;
import com.vitalii.messenger_hub_backend.model.enums.AnalysisStatus;
import com.vitalii.messenger_hub_backend.repository.AnalysisPromptRepository;
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
 * The database side of chat analyses: requesting, reading back and recording results. The work runs
 * in AnalysisRunner on another thread, so every transaction here stays short.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChatAnalysisService {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Ceiling on what the model is shown, whatever the caller asks for. */
    public static final int MAX_MESSAGES = 400;

    private final AnalysisRunRepository runRepository;
    private final AnalysisPromptRepository promptRepository;
    private final ChatRepository chatRepository;
    private final UserService userService;
    private final ApplicationEventPublisher events;

    /** Carries a queued run to the worker once its row is safely committed. */
    public record AnalysisRequested(Long runId) {}

    /** One of the user's own questions, copied out of the row it came from. */
    public record PromptSpec(String name, String prompt) {}

    /** The settings of a run, read once so the worker never touches a lazy relation. */
    public record RunPlan(Long runId, Long chatId, String chatName, Set<AnalysisMetric> metrics,
                          String model, int messageLimit, boolean includeSummary,
                          List<PromptSpec> prompts) {}

    /**
     * Returns a queued run immediately; the client polls it, since a model call takes longer than
     * any sensible HTTP timeout.
     */
    /**
     * Queues one run per model on the same chat, questions and message slice, so models can be
     * compared fairly.
     */
    @Transactional
    public List<AnalysisRun> requestComparison(String email, Long chatId, Set<AnalysisMetric> metrics,
                                               List<String> models, Integer messageLimit,
                                               boolean includeSummary, List<Long> promptIds) {
        List<String> distinct = models == null ? List.of()
                : models.stream().filter(m -> m != null && !m.isBlank()).distinct().toList();
        if (distinct.size() < 2) {
            return List.of(request(email, chatId, metrics,
                    distinct.isEmpty() ? null : distinct.get(0), messageLimit, includeSummary, promptIds));
        }

        String comparisonId = UUID.randomUUID().toString();
        List<AnalysisRun> runs = new ArrayList<>();
        for (String model : distinct) {
            runs.add(request(email, chatId, metrics, model, messageLimit,
                    includeSummary, promptIds, comparisonId));
        }
        return runs;
    }

    @Transactional
    public AnalysisRun request(String email, Long chatId, Set<AnalysisMetric> metrics,
                               String model, Integer messageLimit,
                               boolean includeSummary, List<Long> promptIds) {
        return request(email, chatId, metrics, model, messageLimit, includeSummary, promptIds, null);
    }

    @Transactional
    public AnalysisRun request(String email, Long chatId, Set<AnalysisMetric> metrics,
                               String model, Integer messageLimit,
                               boolean includeSummary, List<Long> promptIds, String comparisonId) {
        Long userId = userService.findByEmail(email).getId();
        Chat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new CustomException("Чат не знайдено", HttpStatus.NOT_FOUND));
        if (!chat.getUser().getId().equals(userId)) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }

        boolean usesModel = model != null && !model.isBlank();
        // Questions are resolved against the caller's own rows, so an id from the request
        // can never pull in somebody else's prompt.
        List<AnalysisPrompt> prompts = usesModel && promptIds != null && !promptIds.isEmpty()
                ? promptRepository.findByUserIdAndIdIn(userId, promptIds)
                : List.of();

        boolean modelHasWork = usesModel && (includeSummary || !prompts.isEmpty());
        if (metrics.isEmpty() && !modelHasWork) {
            throw new CustomException(
                    "Нічого аналізувати: оберіть метрики, підсумок або власне питання",
                    HttpStatus.BAD_REQUEST);
        }

        AnalysisRun run = runRepository.save(AnalysisRun.builder()
                .user(chat.getUser())
                .chat(chat)
                .chatName(chat.getName())
                .status(AnalysisStatus.PENDING)
                .metrics(String.join(",", metrics.stream().map(Enum::name).toList()))
                .model(modelHasWork ? model : null)
                .comparisonId(comparisonId)
                .includeSummary(includeSummary && usesModel)
                .promptIds(prompts.isEmpty() ? null
                        : prompts.stream().map(p -> String.valueOf(p.getId()))
                        .collect(java.util.stream.Collectors.joining(",")))
                .messageLimit(messageLimit == null ? 200 : Math.min(messageLimit, MAX_MESSAGES))
                .build());

        // Published, not called: the worker must not start before this row is committed, or
        // it would look for a run that is not there yet.
        events.publishEvent(new AnalysisRequested(run.getId()));
        return run;
    }

    // ── Steps the worker calls back into ──────────────────────────────────────

    /** Marks a run started and hands the worker everything it needs, detached. */
    @Transactional
    public RunPlan begin(Long runId) {
        AnalysisRun run = runRepository.findById(runId).orElse(null);
        if (run == null) return null;
        run.setStatus(AnalysisStatus.RUNNING);
        runRepository.save(run);
        return new RunPlan(
                run.getId(),
                run.getChat().getId(),
                run.getChatName(),
                parseMetrics(run.getMetrics()),
                run.getModel(),
                run.getMessageLimit() == null ? 200 : run.getMessageLimit(),
                Boolean.TRUE.equals(run.getIncludeSummary()),
                resolvePrompts(run.getUser().getId(), run.getPromptIds()));
    }

    /** The selected prompts as they are now; one deleted since queueing is simply skipped. */
    private List<PromptSpec> resolvePrompts(Long userId, String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        List<Long> ids = new ArrayList<>();
        for (String part : csv.split(",")) {
            try {
                ids.add(Long.parseLong(part.trim()));
            } catch (NumberFormatException ignored) { /* not an id any more */ }
        }
        if (ids.isEmpty()) return List.of();
        return promptRepository.findByUserIdAndIdIn(userId, ids).stream()
                .map(prompt -> new PromptSpec(prompt.getName(), prompt.getPrompt()))
                .toList();
    }

    @Transactional
    public void finish(Long runId, String metricsJson, String insightsJson, String customJson,
                       String error, Long modelMs, int messagesAnalysed) {
        runRepository.findById(runId).ifPresent(run -> {
            run.setMetricsJson(metricsJson);
            run.setInsightsJson(insightsJson);
            run.setCustomJson(customJson);
            run.setError(error);
            run.setModelMs(modelMs);
            run.setMessagesAnalysed(messagesAnalysed);
            run.setFinishedAt(LocalDateTime.now());
            // A model that could not be reached still leaves usable numbers behind, so this
            // is DONE carrying a warning rather than FAILED carrying nothing.
            run.setStatus(metricsJson == null && insightsJson == null && customJson == null
                    ? AnalysisStatus.FAILED : AnalysisStatus.DONE);
            runRepository.save(run);
        });
    }

    @Transactional
    public void fail(Long runId, String message) {
        runRepository.findById(runId).ifPresent(run -> {
            run.setStatus(AnalysisStatus.FAILED);
            run.setError(message);
            run.setFinishedAt(LocalDateTime.now());
            runRepository.save(run);
        });
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AnalysisRun> history(String email, Long chatId) {
        Long userId = userService.findByEmail(email).getId();
        return chatId == null
                ? runRepository.findTop50ByUserIdOrderByCreatedAtDesc(userId)
                : runRepository.findByUserIdAndChatIdOrderByCreatedAtDesc(userId, chatId);
    }

    @Transactional(readOnly = true)
    public AnalysisRun one(String email, Long runId) {
        Long userId = userService.findByEmail(email).getId();
        AnalysisRun run = runRepository.findById(runId)
                .orElseThrow(() -> new CustomException("Аналіз не знайдено", HttpStatus.NOT_FOUND));
        if (!run.getUser().getId().equals(userId)) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }
        return run;
    }

    @Transactional
    public void delete(String email, Long runId) {
        runRepository.delete(one(email, runId));
    }

    // ── The user's own questions ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AnalysisPrompt> prompts(String email) {
        return promptRepository.findByUserIdOrderByNameAsc(userService.findByEmail(email).getId());
    }

    @Transactional
    public AnalysisPrompt savePrompt(String email, Long id, String name, String prompt) {
        if (name == null || name.isBlank()) {
            throw new CustomException("Вкажіть назву метрики", HttpStatus.BAD_REQUEST);
        }
        if (prompt == null || prompt.isBlank()) {
            throw new CustomException("Вкажіть запит до моделі", HttpStatus.BAD_REQUEST);
        }

        var user = userService.findByEmail(email);
        AnalysisPrompt entity = id == null
                ? AnalysisPrompt.builder().user(user).build()
                : promptRepository.findById(id)
                .orElseThrow(() -> new CustomException("Метрику не знайдено", HttpStatus.NOT_FOUND));
        if (!entity.getUser().getId().equals(user.getId())) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }

        entity.setName(name.trim());
        entity.setPrompt(prompt.trim());
        return promptRepository.save(entity);
    }

    @Transactional
    public void deletePrompt(String email, Long id) {
        Long userId = userService.findByEmail(email).getId();
        promptRepository.findById(id)
                .filter(prompt -> prompt.getUser().getId().equals(userId))
                .ifPresent(promptRepository::delete);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private Set<AnalysisMetric> parseMetrics(String csv) {
        if (csv == null || csv.isBlank()) return Set.of();
        Set<AnalysisMetric> metrics = EnumSet.noneOf(AnalysisMetric.class);
        for (String name : csv.split(",")) {
            try {
                metrics.add(AnalysisMetric.valueOf(name.trim()));
            } catch (IllegalArgumentException ignored) {
                // A metric renamed since the run was queued is skipped, not fatal.
            }
        }
        return metrics;
    }

    static String writeJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception e) {
            log.warn("Could not serialise analysis payload: {}", e.getMessage());
            return null;
        }
    }
}
