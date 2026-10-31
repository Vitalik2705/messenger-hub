package com.vitalii.messenger_hub_backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vitalii.messenger_hub_backend.model.dto.AnalysisPromptDTO;
import com.vitalii.messenger_hub_backend.model.dto.AnalysisRunDTO;
import com.vitalii.messenger_hub_backend.model.entity.AnalysisPrompt;
import com.vitalii.messenger_hub_backend.model.entity.AnalysisRun;
import com.vitalii.messenger_hub_backend.model.enums.AnalysisMetric;
import com.vitalii.messenger_hub_backend.service.ChatAnalysisService;
import com.vitalii.messenger_hub_backend.service.OllamaClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Chat analysis: start a run, follow it, read the history. The caller always comes from the token,
 * so another user's run id gives 403.
 */
@RestController
@RequestMapping("/api/analysis")
@RequiredArgsConstructor
@Slf4j
public class AnalysisController {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final ChatAnalysisService analysisService;
    private final OllamaClient ollama;

    /** What the user can ask for, so the client never hardcodes the list. */
    @GetMapping("/options")
    public ResponseEntity<Map<String, Object>> options() {
        List<Map<String, String>> metrics = Arrays.stream(AnalysisMetric.values())
                .map(metric -> Map.of("key", metric.name(), "label", metric.getLabel()))
                .toList();

        // Reported rather than assumed: Ollama is a separate process, and the dialog has to
        // be able to say "not running" instead of offering models that do not exist.
        List<String> models = ollama.availableModels();

        return ResponseEntity.ok(Map.of(
                "metrics", metrics,
                "models", models,
                "modelHostReachable", !models.isEmpty() || ollama.isReachable(),
                "maxMessages", ChatAnalysisService.MAX_MESSAGES));
    }

    public record AnalysisRequest(Long chatId, List<String> metrics, String model,
                                  Integer messageLimit, Boolean includeSummary,
                                  List<Long> promptIds, List<String> models) {}

    @PostMapping("/runs")
    public ResponseEntity<List<AnalysisRunDTO>> start(@AuthenticationPrincipal UserDetails principal,
                                                      @RequestBody AnalysisRequest request) {
        Set<AnalysisMetric> metrics = EnumSet.noneOf(AnalysisMetric.class);
        if (request.metrics() != null) {
            for (String name : request.metrics()) {
                try {
                    metrics.add(AnalysisMetric.valueOf(name));
                } catch (IllegalArgumentException ignored) {
                    // An unknown key is dropped rather than failing the whole request.
                }
            }
        }
        // `models` when comparing, `model` for a single run — a client that knows nothing
        // about comparisons keeps working unchanged.
        List<String> models = request.models() != null && !request.models().isEmpty()
                ? request.models()
                : java.util.Collections.singletonList(request.model());

        List<AnalysisRun> runs = analysisService.requestComparison(
                principal.getUsername(), request.chatId(), metrics,
                models, request.messageLimit(),
                // Absent means yes: the summary is the default thing a model run is for.
                request.includeSummary() == null || request.includeSummary(),
                request.promptIds());
        return ResponseEntity.ok(runs.stream().map(this::toDto).toList());
    }

    // ── The user's own questions ──────────────────────────────────────────────

    public record PromptRequest(String name, String prompt) {}

    @GetMapping("/prompts")
    public ResponseEntity<List<AnalysisPromptDTO>> prompts(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(analysisService.prompts(principal.getUsername())
                .stream().map(this::toDto).toList());
    }

    @PostMapping("/prompts")
    public ResponseEntity<AnalysisPromptDTO> createPrompt(@AuthenticationPrincipal UserDetails principal,
                                                          @RequestBody PromptRequest request) {
        return ResponseEntity.ok(toDto(analysisService.savePrompt(
                principal.getUsername(), null, request.name(), request.prompt())));
    }

    @PatchMapping("/prompts/{id}")
    public ResponseEntity<AnalysisPromptDTO> updatePrompt(@AuthenticationPrincipal UserDetails principal,
                                                          @PathVariable Long id,
                                                          @RequestBody PromptRequest request) {
        return ResponseEntity.ok(toDto(analysisService.savePrompt(
                principal.getUsername(), id, request.name(), request.prompt())));
    }

    @DeleteMapping("/prompts/{id}")
    public ResponseEntity<Map<String, String>> deletePrompt(@AuthenticationPrincipal UserDetails principal,
                                                            @PathVariable Long id) {
        analysisService.deletePrompt(principal.getUsername(), id);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    private AnalysisPromptDTO toDto(AnalysisPrompt prompt) {
        return AnalysisPromptDTO.builder()
                .id(prompt.getId())
                .name(prompt.getName())
                .prompt(prompt.getPrompt())
                .updatedAt(prompt.getUpdatedAt())
                .build();
    }

    @GetMapping("/runs")
    public ResponseEntity<List<AnalysisRunDTO>> history(@AuthenticationPrincipal UserDetails principal,
                                                        @RequestParam(required = false) Long chatId) {
        return ResponseEntity.ok(analysisService.history(principal.getUsername(), chatId)
                .stream().map(this::toDto).toList());
    }

    @GetMapping("/runs/{id}")
    public ResponseEntity<AnalysisRunDTO> one(@AuthenticationPrincipal UserDetails principal,
                                              @PathVariable Long id) {
        return ResponseEntity.ok(toDto(analysisService.one(principal.getUsername(), id)));
    }

    @DeleteMapping("/runs/{id}")
    public ResponseEntity<Map<String, String>> delete(@AuthenticationPrincipal UserDetails principal,
                                                      @PathVariable Long id) {
        analysisService.delete(principal.getUsername(), id);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    // ── Mapping ───────────────────────────────────────────────────────────────

    private AnalysisRunDTO toDto(AnalysisRun run) {
        return AnalysisRunDTO.builder()
                .id(run.getId())
                .chatId(run.getChat().getId())
                .chatName(run.getChatName())
                .status(run.getStatus())
                .metrics(run.getMetrics() == null || run.getMetrics().isBlank()
                        ? List.of() : Arrays.asList(run.getMetrics().split(",")))
                .model(run.getModel())
                .comparisonId(run.getComparisonId())
                .messageLimit(run.getMessageLimit())
                .metricsResult(parse(run.getMetricsJson()))
                .insights(parse(run.getInsightsJson()))
                .custom(parse(run.getCustomJson()))
                .error(run.getError())
                .modelMs(run.getModelMs())
                .messagesAnalysed(run.getMessagesAnalysed())
                .createdAt(run.getCreatedAt())
                .finishedAt(run.getFinishedAt())
                .build();
    }

    /**
     * Unpacks stored JSON. The model's part is parsed defensively and returned as raw text if
     * malformed.
     */
    private Object parse(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return JSON.readValue(json, Object.class);
        } catch (Exception e) {
            log.debug("Analysis payload is not valid JSON, returning as text: {}", e.getMessage());
            return Map.of("raw", json);
        }
    }
}
