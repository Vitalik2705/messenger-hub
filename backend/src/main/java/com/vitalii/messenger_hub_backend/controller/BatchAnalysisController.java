package com.vitalii.messenger_hub_backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vitalii.messenger_hub_backend.model.entity.AnalysisBatch;
import com.vitalii.messenger_hub_backend.model.enums.BatchRanking;
import com.vitalii.messenger_hub_backend.service.BatchAnalysisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** Sweeps across every chat: request one, read the ranking it produced. */
@RestController
@RequestMapping("/api/analysis/batches")
@RequiredArgsConstructor
@Slf4j
public class BatchAnalysisController {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final BatchAnalysisService batchService;

    /** The rankings on offer, named by the server so the client never guesses. */
    @GetMapping("/rankings")
    public ResponseEntity<List<Map<String, String>>> rankings() {
        return ResponseEntity.ok(Arrays.stream(BatchRanking.values())
                .map(r -> Map.of("key", r.name(), "label", r.getLabel()))
                .toList());
    }

    public record StartRequest(String ranking, Boolean peopleOnly, Integer minMessages,
                               Integer topN, String model, List<Long> promptIds,
                               Boolean includeSummary, Integer messageLimit) {}

    @PostMapping
    public ResponseEntity<Map<String, Object>> start(@AuthenticationPrincipal UserDetails principal,
                                                     @RequestBody StartRequest request) {
        BatchRanking ranking;
        try {
            ranking = BatchRanking.valueOf(request.ranking());
        } catch (Exception e) {
            ranking = BatchRanking.UNANSWERED;
        }
        AnalysisBatch batch = batchService.request(principal.getUsername(),
                new BatchAnalysisService.BatchRequest(
                        ranking,
                        request.peopleOnly() == null || request.peopleOnly(),
                        request.minMessages(),
                        request.topN(),
                        request.model(),
                        request.promptIds(),
                        request.includeSummary() == null || request.includeSummary(),
                        request.messageLimit()));
        return ResponseEntity.ok(toMap(batch));
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> history(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(batchService.history(principal.getUsername())
                .stream().map(this::toMap).toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> one(@AuthenticationPrincipal UserDetails principal,
                                                   @PathVariable Long id) {
        return ResponseEntity.ok(toMap(batchService.one(principal.getUsername(), id)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> delete(@AuthenticationPrincipal UserDetails principal,
                                                      @PathVariable Long id) {
        batchService.delete(principal.getUsername(), id);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    private Map<String, Object> toMap(AnalysisBatch batch) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", batch.getId());
        map.put("status", batch.getStatus());
        map.put("ranking", batch.getRanking());
        map.put("rankingLabel", batch.getRanking().getLabel());
        map.put("peopleOnly", batch.getPeopleOnly());
        map.put("minMessages", batch.getMinMessages());
        map.put("scannedCount", batch.getScannedCount());
        map.put("modelTopN", batch.getModelTopN());
        map.put("model", batch.getModel());
        map.put("error", batch.getError());
        map.put("createdAt", batch.getCreatedAt());
        map.put("finishedAt", batch.getFinishedAt());
        map.put("rows", parse(batch.getTableJson()));
        return map;
    }

    private Object parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return JSON.readValue(json, Object.class);
        } catch (Exception e) {
            log.debug("Batch table is not valid JSON: {}", e.getMessage());
            return List.of();
        }
    }
}
