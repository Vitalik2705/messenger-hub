package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.ChatDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.TelegramService;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/telegram")
@RequiredArgsConstructor
@Slf4j
public class TelegramController {

    private final TelegramService telegramService;
    private final UserService userService;

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        var account = telegramService.getTelegramAccount(user.getId());
        boolean connected = account != null && Boolean.TRUE.equals(account.getIsConnected());
        return ResponseEntity.ok(Map.of("connected", connected));
    }

    @GetMapping("/chats")
    public ResponseEntity<List<ChatDTO>> getChats(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getUserChats(user.getId()));
    }

    @GetMapping("/chats/{externalChatId}/messages")
    public ResponseEntity<List<MessageDTO>> getChatMessages(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String externalChatId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "0") int minId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getChatMessages(
                externalChatId, user.getId(), limit, offset, minId));
    }

    @GetMapping("/message-media")
    public ResponseEntity<Map<String, Object>> getMessageMedia(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam String chatId,
            @RequestParam String messageId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getMessageMedia(user.getId(), chatId, messageId));
    }

    @PostMapping("/send")
    public ResponseEntity<?> sendMessage(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, Object> body) {
        try {
            User user = userService.findByEmail(userDetails.getUsername());
            String chatId = String.valueOf(body.get("chat_id"));
            String text = (String) body.get("text");
            return ResponseEntity.ok(telegramService.sendMessage(user.getId(), chatId, text));
        } catch (Exception e) {
            log.error("Send error: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/user-status/{chatId}")
    public ResponseEntity<Map<String, Object>> getUserStatus(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String chatId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.getUserStatus(user.getId(), chatId));
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
            @PathVariable String chatId) {
        User user = userService.findByEmail(userDetails.getUsername());
        telegramService.markAsRead(user.getId(), chatId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<?> disconnect(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        telegramService.disconnect(user.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/sync")
    public ResponseEntity<?> sync(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        telegramService.getUserChats(user.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }
}