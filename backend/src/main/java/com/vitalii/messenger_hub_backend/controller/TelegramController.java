package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.ChatDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessengerAccountDTO;
import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.dto.SendMediaRequest;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.TelegramService;
import com.vitalii.messenger_hub_backend.service.MediaUploadValidator;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/telegram")
@RequiredArgsConstructor
@Slf4j
public class TelegramController {

    private final TelegramService telegramService;
    private final UserService userService;
    private final MediaUploadValidator mediaUploadValidator;

    @GetMapping("/accounts")
    public ResponseEntity<List<MessengerAccountDTO>> getAccounts(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<MessengerAccountDTO> accounts = telegramService.getTelegramAccounts(user.getId())
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

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<MessengerAccount> accounts = telegramService.getTelegramAccounts(user.getId());
        boolean connected = !accounts.isEmpty();
        return ResponseEntity.ok(Map.of("connected", connected, "accountCount", accounts.size()));
    }

    @GetMapping("/chats")
    public ResponseEntity<List<ChatDTO>> getChats(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(required = false) Long accountId,
            // Polls pass false: the client already holds every avatar from the first load,
            // and with them a refresh weighs megabytes instead of kilobytes.
            @RequestParam(defaultValue = "true") boolean avatars) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<ChatDTO> chats = telegramService.getUserChats(user.getId(), accountId);
        if (!avatars) chats.forEach(chat -> chat.setAvatarBase64(null));
        return ResponseEntity.ok(chats);
    }

    @PostMapping("/toggle-pin/{externalChatId}")
    public ResponseEntity<Map<String, Boolean>> togglePin(
            @PathVariable String externalChatId,
            @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = userService.findByEmail(userDetails.getUsername()).getId();
        boolean isPinned = telegramService.togglePinChat(userId, externalChatId);
        return ResponseEntity.ok(Map.of("isPinned", isPinned));
    }

    @GetMapping("/chats/{externalChatId}/messages")
    public ResponseEntity<List<MessageDTO>> getChatMessages(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String externalChatId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "0") int minId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getChatMessages(
                externalChatId, user.getId(), limit, offset, minId, accountId));
    }

    @GetMapping("/message-media")
    public ResponseEntity<Map<String, Object>> getMessageMedia(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam String chatId,
            @RequestParam String messageId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getMessageMedia(user.getId(), chatId, messageId, accountId));
    }

    @PostMapping("/send")
    public ResponseEntity<Map<String, Object>> sendMessage(
            @RequestBody Map<String, String> body,
            @RequestParam(required = false) Long accountId,
            @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = userService.findByEmail(userDetails.getUsername()).getId();
        String chatId = body.get("chat_id");
        String text = body.get("text");
        String replyToMessageId = body.get("reply_to_message_id");
        Map<String, Object> result = telegramService.sendMessage(userId, chatId, text, replyToMessageId, accountId);
        return ResponseEntity.ok(result);
    }

    /** Sends a picture, file or voice note, validated before Telegram is called. */
    @PostMapping("/send-media")
    public ResponseEntity<?> sendMedia(
            @RequestBody SendMediaRequest request,
            @RequestParam(required = false) Long accountId,
            @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = userService.findByEmail(userDetails.getUsername()).getId();
        try {
            return ResponseEntity.ok(telegramService.sendMedia(
                    userId, request.getChatId(), mediaUploadValidator.validate(request), accountId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/user-status/{chatId}")
    public ResponseEntity<Map<String, Object>> getUserStatus(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String chatId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getUserStatus(user.getId(), chatId, accountId));
    }

    @PostMapping("/react")
    public ResponseEntity<Map<String, Object>> react(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, Object> request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.react(user.getId(),
                String.valueOf(request.get("chat_id")), String.valueOf(request.get("message_id")),
                (String) request.get("emoji"), accountId));
    }

    @PostMapping("/edit")
    public ResponseEntity<Map<String, Object>> edit(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, Object> request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.editMessage(user.getId(),
                String.valueOf(request.get("chat_id")), String.valueOf(request.get("message_id")),
                String.valueOf(request.get("text")), accountId));
    }

    @GetMapping("/typing/{chatId}")
    public ResponseEntity<Map<String, Object>> isTyping(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String chatId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.isTyping(user.getId(), chatId, accountId));
    }

    @PostMapping("/typing/{chatId}")
    public ResponseEntity<Map<String, Object>> sendTyping(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String chatId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        telegramService.sendTyping(user.getId(), chatId, accountId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/profile/{chatId}")
    public ResponseEntity<Map<String, Object>> getProfile(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String chatId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getProfile(user.getId(), chatId, accountId));
    }

    @GetMapping("/avatar/{chatId}")
    public ResponseEntity<Map<String, Object>> getAvatar(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String chatId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getAvatar(user.getId(), chatId));
    }

    @PostMapping("/mark-read/{chatId}")
    public ResponseEntity<?> markAsRead(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String chatId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        telegramService.markAsRead(user.getId(), chatId, accountId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<?> disconnect(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        telegramService.disconnect(user.getId(), accountId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/sync")
    public ResponseEntity<?> sync(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        telegramService.getUserChats(user.getId(), accountId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/delete")
    public ResponseEntity<Map<String, Object>> deleteMessage(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, Object> request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        Map<String, Object> result = telegramService.deleteMessage(
                user.getId(),
                String.valueOf(request.get("chat_id")),
                String.valueOf(request.get("message_id")),
                (Boolean) request.getOrDefault("revoke", true),
                accountId
        );
        return ResponseEntity.ok(result);
    }
}
