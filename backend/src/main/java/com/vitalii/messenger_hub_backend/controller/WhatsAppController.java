package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.ChatDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessengerAccountDTO;
import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.dto.SendMediaRequest;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.MediaUploadValidator;
import com.vitalii.messenger_hub_backend.service.UserService;
import com.vitalii.messenger_hub_backend.service.WhatsAppService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/whatsapp")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class WhatsAppController {

    private final WhatsAppService whatsAppService;
    private final UserService userService;
    private final MediaUploadValidator mediaUploadValidator;

    @GetMapping("/accounts")
    public ResponseEntity<List<MessengerAccountDTO>> getAccounts(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<MessengerAccountDTO> accounts = whatsAppService.getWhatsAppAccounts(user.getId())
                .stream()
                .map(a -> MessengerAccountDTO.builder()
                        .id(a.getId())
                        .messengerType(a.getMessengerType())
                        .username(a.getUsername())
                        .accountLabel(a.getAccountLabel())
                        .externalUserId(a.getExternalUserId())
                        .isConnected(a.getIsConnected())
                        .lastSyncAt(a.getLastSyncAt())
                        .createdAt(a.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
        return ResponseEntity.ok(accounts);
    }

    @PostMapping("/init-session")
    public ResponseEntity<Map<String, Object>> initSession(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        Map<String, Object> result = whatsAppService.initSession(user.getId());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/session-status")
    public ResponseEntity<Map<String, Object>> sessionStatus(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam String sessionId) {
        User user = userService.findByEmail(userDetails.getUsername());
        Map<String, Object> result = whatsAppService.checkSession(user.getId(), sessionId);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<MessengerAccount> accounts = whatsAppService.getWhatsAppAccounts(user.getId());
        return ResponseEntity.ok(Map.of("connected", !accounts.isEmpty(), "accountCount", accounts.size()));
    }

    @GetMapping("/chats")
    public ResponseEntity<List<ChatDTO>> getChats(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(whatsAppService.getUserChats(user.getId()));
    }

    @GetMapping("/chats/{externalChatId}/messages")
    public ResponseEntity<List<MessageDTO>> getChatMessages(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String externalChatId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(whatsAppService.getChatMessages(externalChatId, user.getId(), accountId));
    }

    @PostMapping("/send")
    public ResponseEntity<Map<String, String>> sendMessage(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        whatsAppService.sendMessage(user.getId(), request.get("chatId"), request.get("text"), accountId);
        return ResponseEntity.ok(Map.of("message", "Message sent"));
    }


    /**
     * Sends an attachment — picture, file, or voice recording.
     *
     * Validation runs before the messenger is touched, so an oversized or malformed upload
     * is rejected here rather than surfacing as an obscure failure from WhatsApp.
     */
    @PostMapping("/send-media")
    public ResponseEntity<?> sendMedia(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody SendMediaRequest request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        try {
            whatsAppService.sendMedia(
                    user.getId(), request.getChatId(), mediaUploadValidator.validate(request), accountId);
            return ResponseEntity.ok(Map.of("message", "Media sent"));
        } catch (IllegalArgumentException | UnsupportedOperationException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }


    /**
     * Deletes a message for everyone and drops the archived copy.
     */
    @PostMapping("/delete")
    public ResponseEntity<?> deleteMessage(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        try {
            whatsAppService.deleteMessage(
                    user.getId(), request.get("chatId"), request.get("messageId"), accountId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (UnsupportedOperationException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/disconnect")
    public ResponseEntity<Map<String, String>> disconnect(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        whatsAppService.disconnect(user.getId(), accountId);
        return ResponseEntity.ok(Map.of("message", "WhatsApp disconnected"));
    }
}
