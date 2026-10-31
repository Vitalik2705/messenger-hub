package com.vitalii.messenger_hub_backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.entity.Message;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.repository.ChatRepository;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** How much history has been archived locally. */
@RestController
@RequestMapping("/api/archive")
@RequiredArgsConstructor
@Slf4j
public class ArchiveController {

    /** More than a screenful, but bounded so a crafted limit cannot pull a whole chat. */
    private static final int MAX_LIMIT = 200;

    /** A local mapper: it only reads a flat summary written by the archiver. */
    private static final ObjectMapper JSON = new ObjectMapper();

    private final MessageRepository messageRepository;
    private final ChatRepository chatRepository;
    private final UserService userService;

    /**
     * The archived history of one chat, oldest first, so a chat opens instantly while the live
     * fetch runs. Empty for a never-archived chat. Media payloads are not archived, only the fact
     * of an attachment.
     */
    @GetMapping("/messages")
    public ResponseEntity<List<MessageDTO>> messages(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam Long accountId,
            @RequestParam String externalChatId,
            @RequestParam(defaultValue = "50") int limit) {

        User user = userService.findByEmail(userDetails.getUsername());
        Optional<Chat> chat = chatRepository
                .findByMessengerAccountIdAndExternalChatId(accountId, externalChatId);

        // Ownership is checked against the chat's own user, not the account parameter:
        // otherwise any authenticated user could read any archived chat by guessing ids.
        if (chat.isEmpty() || !chat.get().getUser().getId().equals(user.getId())) {
            return ResponseEntity.ok(List.of());
        }

        int capped = Math.max(1, Math.min(limit, MAX_LIMIT));
        List<Message> newestFirst = messageRepository
                .findByChatIdOrderByTimestampDesc(chat.get().getId(), PageRequest.of(0, capped));

        List<MessageDTO> result = new ArrayList<>(newestFirst.size());
        for (Message message : newestFirst) result.add(toDto(message, chat.get().getId()));
        Collections.reverse(result); // the client renders oldest-first
        return ResponseEntity.ok(result);
    }

    private MessageDTO toDto(Message message, Long chatId) {
        MessageDTO.MessageDTOBuilder dto = MessageDTO.builder()
                .id(message.getId())
                .chatId(chatId)
                .externalMessageId(message.getExternalMessageId())
                .text(message.getText())
                .senderId(message.getSenderId())
                .senderName(message.getSenderName())
                .isFromUser(message.getIsFromUser())
                .status(message.getStatus())
                .isRead("READ".equals(message.getStatus()))
                .timestamp(message.getTimestamp());

        // Attachments were stored as the JSON summary the archiver writes; unpacking it
        // back into fields is what lets the bubble draw a media placeholder at once.
        if (message.getAttachments() != null && !message.getAttachments().isBlank()) {
            try {
                JsonNode node = JSON.readTree(message.getAttachments());
                if (node.hasNonNull("type")) dto.mediaType(node.get("type").asText());
                if (node.hasNonNull("mime")) dto.mediaMime(node.get("mime").asText());
                if (node.hasNonNull("fileName")) dto.fileName(node.get("fileName").asText());
                if (node.hasNonNull("duration")) dto.duration(node.get("duration").asInt());
            } catch (Exception e) {
                log.debug("Unreadable attachment summary on message {}: {}", message.getId(), e.getMessage());
            }
        }
        return dto.build();
    }

    /**
     * Transcripts of one chat as a map from the messenger's message id to text, which the client
     * merges into whatever copy of the chat it shows.
     */
    @GetMapping("/transcripts")
    public ResponseEntity<Map<String, String>> transcripts(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam Long accountId,
            @RequestParam String externalChatId) {

        User user = userService.findByEmail(userDetails.getUsername());
        var chat = chatRepository.findByMessengerAccountIdAndExternalChatId(accountId, externalChatId);
        if (chat.isEmpty()) return ResponseEntity.ok(Map.of());

        String owner = chatRepository.findOwnerEmail(chat.get().getId()).orElse(null);
        if (owner == null || !owner.equals(user.getEmail())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of());
        }

        Map<String, String> transcripts = new HashMap<>();
        for (Object[] row : messageRepository.findTranscripts(chat.get().getId())) {
            transcripts.put((String) row[0], (String) row[1]);
        }
        return ResponseEntity.ok(transcripts);
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats(@AuthenticationPrincipal UserDetails userDetails) {
        User user = userService.findByEmail(userDetails.getUsername());
        Long userId = user.getId();

        Map<String, Long> byMessenger = new LinkedHashMap<>();
        for (Object[] row : messageRepository.countGroupedByMessengerType(userId)) {
            byMessenger.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }

        LocalDateTime oldest = messageRepository.findOldestTimestamp(userId);
        LocalDateTime newest = messageRepository.findNewestTimestamp(userId);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalMessages", messageRepository.countByUserId(userId));
        stats.put("chatsWithMessages", messageRepository.countChatsWithMessages(userId));
        stats.put("byMessenger", byMessenger);
        stats.put("oldestMessageAt", oldest);
        stats.put("newestMessageAt", newest);
        return ResponseEntity.ok(stats);
    }
}
