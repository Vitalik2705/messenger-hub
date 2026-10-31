package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.HybridSearchService;
import com.vitalii.messenger_hub_backend.service.MessageSearchService;
import com.vitalii.messenger_hub_backend.service.OllamaClient;
import com.vitalii.messenger_hub_backend.service.SemanticSearchService;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Search over archived history, always scoped to the authenticated user's chats. */
@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
public class SearchController {

    private final MessageSearchService messageSearchService;
    private final SemanticSearchService semanticSearchService;
    private final HybridSearchService hybridSearchService;
    private final UserService userService;

    @GetMapping("/messages")
    public ResponseEntity<MessageSearchService.SearchResults> searchMessages(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam("q") String query,
            @RequestParam(value = "chatId", required = false) Long chatId,
            @RequestParam(value = "messenger", required = false) String messengerType,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "offset", required = false) Integer offset) {

        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(messageSearchService.search(
                user.getId(), query, chatId, messengerType, limit, offset));
    }

    /**
     * Search by meaning. A separate route: results carry a similarity instead of a highlighted
     * snippet.
     */
    @GetMapping("/semantic")
    public ResponseEntity<Map<String, Object>> searchSemantic(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam("q") String query,
            @RequestParam(value = "limit", required = false) Integer limit) {

        User user = userService.findByEmail(userDetails.getUsername());
        int effective = Math.max(1, Math.min(limit == null ? 20 : limit, 50));
        try {
            var results = semanticSearchService.search(user.getId(), query, effective);
            return ResponseEntity.ok(Map.of("query", query, "results", results));
        } catch (OllamaClient.OllamaUnavailableException e) {
            // Reported as a result rather than an error: the ordinary search above still
            // works, and the client shows this next to it.
            return ResponseEntity.ok(Map.of(
                    "query", query, "results", List.of(), "error", e.getMessage()));
        }
    }

    /** Both searches at once, merged into one ranking — see HybridSearchService. */
    @GetMapping("/hybrid")
    public ResponseEntity<HybridSearchService.Results> searchHybrid(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam("q") String query,
            @RequestParam(value = "messenger", required = false) String messengerType,
            @RequestParam(value = "limit", required = false) Integer limit) {

        User user = userService.findByEmail(userDetails.getUsername());
        int effective = Math.max(1, Math.min(limit == null ? 20 : limit, 50));
        return ResponseEntity.ok(hybridSearchService.search(user.getId(), query, messengerType, effective));
    }

    /** How much of the archive is searchable by meaning yet. */
    @GetMapping("/semantic/status")
    public ResponseEntity<SemanticSearchService.Status> semanticStatus(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(semanticSearchService.status(user.getId()));
    }
}
