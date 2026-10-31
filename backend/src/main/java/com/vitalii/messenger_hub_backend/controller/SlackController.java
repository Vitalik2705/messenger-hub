package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.ChatDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessengerAccountDTO;
import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.dto.SendMediaRequest;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.SlackService;
import com.vitalii.messenger_hub_backend.service.MediaUploadValidator;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/slack")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class SlackController {

    private final SlackService slackService;
    private final UserService userService;
    private final MediaUploadValidator mediaUploadValidator;

    @GetMapping("/accounts")
    public ResponseEntity<List<MessengerAccountDTO>> getAccounts(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<MessengerAccountDTO> accounts = slackService.getSlackAccounts(user.getId())
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

    @PostMapping("/connect")
    public ResponseEntity<MessengerAccountDTO> connectSlack(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request) {
        User user = userService.findByEmail(userDetails.getUsername());
        MessengerAccount account = slackService.connectSlack(user.getId(), request.get("token"));
        return ResponseEntity.ok(MessengerAccountDTO.builder()
                .id(account.getId())
                .messengerType(account.getMessengerType())
                .username(account.getUsername())
                .accountLabel(account.getAccountLabel())
                .isConnected(account.getIsConnected())
                .lastSyncAt(account.getLastSyncAt())
                .build());
    }

    @GetMapping("/chats")
    public ResponseEntity<List<ChatDTO>> getChats(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(slackService.getUserChats(user.getId()));
    }

    @GetMapping("/chats/{externalChatId}/messages")
    public ResponseEntity<List<MessageDTO>> getChatMessages(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String externalChatId,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(slackService.getChatMessages(externalChatId, user.getId(), accountId));
    }

    @PostMapping("/send")
    public ResponseEntity<Map<String, String>> sendMessage(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        slackService.sendMessage(user.getId(), request.get("channelId"), request.get("text"), accountId);
        return ResponseEntity.ok(Map.of("message", "Message sent successfully"));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<MessengerAccount> accounts = slackService.getSlackAccounts(user.getId());
        boolean connected = !accounts.isEmpty();
        return ResponseEntity.ok(Map.of("connected", connected, "accountCount", accounts.size()));
    }


    /**
     * Sends an attachment — picture, file, or voice recording.
     *
     * Validation runs before the messenger is touched, so an oversized or malformed upload
     * is rejected here rather than surfacing as an obscure failure from Slack.
     */
    @PostMapping("/send-media")
    public ResponseEntity<?> sendMedia(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody SendMediaRequest request,
            @RequestParam(required = false) Long accountId) {
        User user = userService.findByEmail(userDetails.getUsername());
        try {
            slackService.sendMedia(
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
            slackService.deleteMessage(
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
        slackService.disconnect(user.getId(), accountId);
        return ResponseEntity.ok(Map.of("message", "Slack disconnected"));
    }

    @PostMapping("/sync")
    public ResponseEntity<Map<String, String>> syncChats(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        List<MessengerAccount> accounts = slackService.getSlackAccounts(user.getId());
        if (accounts.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Slack not connected"));
        accounts.forEach(slackService::syncChats);
        return ResponseEntity.ok(Map.of("message", "Synced successfully"));
    }
}
