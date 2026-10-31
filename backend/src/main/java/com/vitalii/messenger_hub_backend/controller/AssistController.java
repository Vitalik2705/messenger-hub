package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.service.AssistService;
import com.vitalii.messenger_hub_backend.service.InboxService;
import com.vitalii.messenger_hub_backend.service.OllamaClient;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * The model inside a conversation (catch-up summary, reply suggestions) and the inbox view
 * of what is waiting for an answer.
 */
@RestController
@RequestMapping("/api/assist")
@RequiredArgsConstructor
public class AssistController {

    private final AssistService assistService;
    private final InboxService inboxService;
    private final UserService userService;

    public record LinesRequest(List<AssistService.Line> messages) {}

    @PostMapping("/catch-up")
    public ResponseEntity<Map<String, Object>> catchUp(@RequestBody LinesRequest request) {
        return run(() -> assistService.catchUp(request.messages()));
    }

    @PostMapping("/replies")
    public ResponseEntity<Map<String, Object>> replies(@RequestBody LinesRequest request) {
        return run(() -> assistService.suggestReplies(request.messages()));
    }

    @GetMapping("/unanswered")
    public ResponseEntity<List<Map<String, Object>>> unanswered(@AuthenticationPrincipal UserDetails userDetails) {
        Long userId = userService.findByEmail(userDetails.getUsername()).getId();
        return ResponseEntity.ok(inboxService.unanswered(userId));
    }

    private ResponseEntity<Map<String, Object>> run(java.util.function.Supplier<Map<String, Object>> work) {
        try {
            return ResponseEntity.ok(work.get());
        } catch (OllamaClient.OllamaUnavailableException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("message", e.getMessage()));
        }
    }
}
