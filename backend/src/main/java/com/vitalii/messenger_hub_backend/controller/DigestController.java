package com.vitalii.messenger_hub_backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vitalii.messenger_hub_backend.model.entity.Digest;
import com.vitalii.messenger_hub_backend.service.DigestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** "While you were away", across every connected network. */
@RestController
@RequestMapping("/api/digest")
@RequiredArgsConstructor
@Slf4j
public class DigestController {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final DigestService digestService;

    public record StartRequest(Integer hoursBack, String model, Integer topN, String scope) {}

    @PostMapping
    public ResponseEntity<Map<String, Object>> start(@AuthenticationPrincipal UserDetails principal,
                                                     @RequestBody StartRequest request) {
        return ResponseEntity.ok(toMap(digestService.request(principal.getUsername(),
                request.hoursBack(), request.model(), request.topN(), request.scope())));
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> history(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(digestService.history(principal.getUsername())
                .stream().map(this::toMap).toList());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> delete(@AuthenticationPrincipal UserDetails principal,
                                                      @PathVariable Long id) {
        digestService.delete(principal.getUsername(), id);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }

    private Map<String, Object> toMap(Digest digest) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", digest.getId());
        map.put("status", digest.getStatus());
        map.put("fromAt", digest.getFromAt());
        map.put("toAt", digest.getToAt());
        map.put("model", digest.getModel());
        map.put("scope", digest.getScope() == null ? null : digest.getScope().name());
        map.put("chatsTouched", digest.getChatsTouched());
        map.put("messagesReceived", digest.getMessagesReceived());
        map.put("modelMs", digest.getModelMs());
        map.put("error", digest.getError());
        map.put("createdAt", digest.getCreatedAt());
        map.put("items", parseItems(digest.getItemsJson()));
        return map;
    }

    /** Unpacks stored digest items and the model's JSON summary inside each. */
    @SuppressWarnings("unchecked")
    private Object parseItems(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Map<String, Object>> items = JSON.readValue(json, List.class);
            for (Map<String, Object> item : items) {
                Object summary = item.get("summary");
                if (summary instanceof String raw) {
                    try {
                        item.put("summary", JSON.readValue(raw, Object.class));
                    } catch (Exception e) {
                        item.put("summary", Map.of("summary", raw));
                    }
                }
            }
            return items;
        } catch (Exception e) {
            log.debug("Digest items are not valid JSON: {}", e.getMessage());
            return List.of();
        }
    }
}
