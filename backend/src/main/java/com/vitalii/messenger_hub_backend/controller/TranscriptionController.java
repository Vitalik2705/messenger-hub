package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.TranscriptionService;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Progress of voice transcription. */
@RestController
@RequestMapping("/api/transcription")
@RequiredArgsConstructor
public class TranscriptionController {

    private final TranscriptionService transcriptionService;
    private final UserService userService;

    @GetMapping("/status")
    public ResponseEntity<TranscriptionService.Status> status(
            @AuthenticationPrincipal UserDetails principal) {
        User user = userService.findByEmail(principal.getUsername());
        return ResponseEntity.ok(transcriptionService.status(user.getId()));
    }

    /**
     * Transcribes one voice message and returns the text. Synchronous: the wait is about the clip's
     * length.
     */
    public record MessageRequest(Long accountId, String externalChatId, String externalMessageId) {}

    @PostMapping("/message")
    public ResponseEntity<Map<String, Object>> transcribeMessage(
            @AuthenticationPrincipal UserDetails principal,
            @RequestBody MessageRequest request) {
        User user = userService.findByEmail(principal.getUsername());
        try {
            String text = transcriptionService.transcribeMessage(user.getId(),
                    request.accountId(), request.externalChatId(), request.externalMessageId());
            return ResponseEntity.ok(text == null || text.isBlank()
                    ? Map.of("text", "", "empty", true)
                    : Map.of("text", text));
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(Map.of("error", "Access denied"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("error", messageOf(e)));
        }
    }

    private String messageOf(Exception e) {
        String message = e.getMessage();
        return message == null || message.isBlank() ? "Не вдалося розшифрувати" : message;
    }

    /** Runs one batch now, of the same bounded size as the scheduled job. */
    @PostMapping("/run")
    public ResponseEntity<Map<String, Object>> runNow() {
        if (!transcriptionService.isReachable()) {
            return ResponseEntity.ok(Map.of(
                    "started", false,
                    "error", "Сервіс розшифровки не відповідає. Запустіть whisper-service на порту 8206."));
        }
        transcriptionService.transcribeBacklog();
        return ResponseEntity.ok(Map.of("started", true));
    }
}
