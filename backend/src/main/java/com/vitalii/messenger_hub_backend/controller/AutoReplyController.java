package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.entity.AutoReplySettings;
import com.vitalii.messenger_hub_backend.model.entity.ReplyDraft;
import com.vitalii.messenger_hub_backend.model.enums.AutoReplyMode;
import com.vitalii.messenger_hub_backend.model.enums.DraftStatus;
import com.vitalii.messenger_hub_backend.service.AutoReplyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Generated replies: how they behave, where they are allowed, and what became of them.
 */
@RestController
@RequestMapping("/api/autoreply")
@RequiredArgsConstructor
public class AutoReplyController {

    private final AutoReplyService autoReplyService;

    @GetMapping("/settings")
    public ResponseEntity<Map<String, Object>> settings(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(toMap(autoReplyService.settingsFor(principal.getUsername())));
    }

    @PutMapping("/settings")
    public ResponseEntity<Map<String, Object>> update(@AuthenticationPrincipal UserDetails principal,
                                                      @RequestBody AutoReplySettings incoming) {
        return ResponseEntity.ok(toMap(autoReplyService.updateSettings(principal.getUsername(), incoming)));
    }

    /**
     * One chat's auto-reply mode, read separately because ChatDTO is rebuilt from the messengers on
     * every sync.
     */
    @GetMapping("/chats/{chatId}/mode")
    public ResponseEntity<Map<String, String>> mode(@AuthenticationPrincipal UserDetails principal,
                                                    @PathVariable Long chatId) {
        return ResponseEntity.ok(Map.of(
                "mode", autoReplyService.chatMode(principal.getUsername(), chatId).name()));
    }

    public record ModeRequest(String mode) {}

    @PutMapping("/chats/{chatId}/mode")
    public ResponseEntity<Map<String, String>> setMode(@AuthenticationPrincipal UserDetails principal,
                                                       @PathVariable Long chatId,
                                                       @RequestBody ModeRequest request) {
        AutoReplyMode mode;
        try {
            mode = AutoReplyMode.valueOf(request.mode());
        } catch (Exception e) {
            mode = AutoReplyMode.OFF;
        }
        autoReplyService.setChatMode(principal.getUsername(), chatId, mode);
        return ResponseEntity.ok(Map.of("mode", mode.name()));
    }

    /** The draft waiting in one chat's composer, if there is one. */
    @GetMapping("/drafts")
    public ResponseEntity<Map<String, Object>> draft(@AuthenticationPrincipal UserDetails principal,
                                                     @RequestParam Long chatId) {
        return autoReplyService.pendingDraft(principal.getUsername(), chatId)
                .<ResponseEntity<Map<String, Object>>>map(draft -> ResponseEntity.ok(draftMap(draft)))
                .orElseGet(() -> ResponseEntity.ok(Map.of()));
    }

    public record ResolveRequest(String status) {}

    /** Records what the user did with a suggestion: sent as written, edited, or dismissed. */
    @PostMapping("/drafts/{id}/resolve")
    public ResponseEntity<Map<String, String>> resolve(@AuthenticationPrincipal UserDetails principal,
                                                       @PathVariable Long id,
                                                       @RequestBody ResolveRequest request) {
        DraftStatus status;
        try {
            status = DraftStatus.valueOf(request.status());
        } catch (Exception e) {
            status = DraftStatus.REJECTED;
        }
        autoReplyService.resolveDraft(principal.getUsername(), id, status);
        return ResponseEntity.ok(Map.of("status", status.name()));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Long>> stats(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(autoReplyService.acceptanceStats(principal.getUsername()));
    }

    // ── Mapping ───────────────────────────────────────────────────────────────

    private Map<String, Object> toMap(AutoReplySettings settings) {
        Map<String, Object> map = new HashMap<>();
        map.put("enabled", settings.getEnabled());
        map.put("model", settings.getModel());
        map.put("instructions", settings.getInstructions());
        map.put("disclosure", settings.getDisclosure());
        map.put("cooldownMinutes", settings.getCooldownMinutes());
        map.put("dailyLimit", settings.getDailyLimit());
        map.put("contextMessages", settings.getContextMessages());
        map.put("quietFromHour", settings.getQuietFromHour());
        map.put("quietToHour", settings.getQuietToHour());
        map.put("maxReplyChars", settings.getMaxReplyChars());
        map.put("minIncomingChars", settings.getMinIncomingChars());
        map.put("stopWords", settings.getStopWords());
        map.put("temperature", settings.getTemperature());
        return map;
    }

    private Map<String, Object> draftMap(ReplyDraft draft) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", draft.getId());
        map.put("text", draft.getText());
        map.put("model", draft.getModel());
        map.put("modelMs", draft.getModelMs());
        map.put("basedOnMessageId", draft.getBasedOnMessageId());
        map.put("createdAt", draft.getCreatedAt());
        return map;
    }
}
