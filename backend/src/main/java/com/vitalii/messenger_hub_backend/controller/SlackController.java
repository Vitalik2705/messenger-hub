package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.ChatDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessengerAccountDTO;
import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.SlackService;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/slack")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class SlackController {

    private final SlackService slackService;
    private final UserService userService;

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
            @PathVariable String externalChatId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(slackService.getChatMessages(externalChatId, user.getId()));
    }

    @PostMapping("/send")
    public ResponseEntity<Map<String, String>> sendMessage(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request) {
        User user = userService.findByEmail(userDetails.getUsername());
        slackService.sendMessage(user.getId(), request.get("channelId"), request.get("text"));
        return ResponseEntity.ok(Map.of("message", "Message sent successfully"));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        MessengerAccount account = slackService.getSlackAccount(user.getId());
        if (account == null) return ResponseEntity.ok(Map.of("connected", false));
        return ResponseEntity.ok(Map.of(
                "connected", true,
                "username", account.getUsername(),
                "lastSyncAt", account.getLastSyncAt()
        ));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<Map<String, String>> disconnect(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        slackService.disconnect(user.getId());
        return ResponseEntity.ok(Map.of("message", "Slack disconnected"));
    }

    @PostMapping("/sync")
    public ResponseEntity<Map<String, String>> syncChats(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        MessengerAccount account = slackService.getSlackAccount(user.getId());
        if (account == null) return ResponseEntity.badRequest().body(Map.of("error", "Slack not connected"));
        slackService.syncChats(account);
        return ResponseEntity.ok(Map.of("message", "Synced successfully"));
    }
}