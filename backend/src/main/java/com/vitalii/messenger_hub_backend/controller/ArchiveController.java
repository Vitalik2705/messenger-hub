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

/**
 * Reports how much conversation history has accumulated locally.
 * Used to confirm the archive is growing and to describe the corpus later on.
 */
@RestController
@RequestMapping("/api/archive")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
@Slf4j
public class ArchiveController {

    /** More than a screenful, but bounded so a crafted limit cannot pull a whole chat. */
    private static final int MAX_LIMIT = 200;

    /**
     * Own instance rather than an injected bean: the application context does not publish
     * an ObjectMapper, and this reads a flat summary written by the archiver itself, so it
     * needs none of the application's serialisation settings.
     */
    private static final ObjectMapper JSON = new ObjectMapper();

    private final MessageRepository messageRepository;
    private final ChatRepository chatRepository;
    private final UserService userService;

    /**
     * The locally archived history of one chat, oldest first.
     *
     * This exists to make opening a chat instant. The messenger APIs are the source of
     * truth but are seconds away over the network, so the client renders this first and
     * reconciles with the live fetch when it lands. A chat that has never been archived
     * returns an empty list, which the client treats as "no shortcut available" rather
     * than "no messages".
     *
     * Media is deliberately absent: only the fact of an attachment is archived, so the
     * placeholder renders immediately and the payload is fetched on demand.
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
     * Transcripts for one chat, as a map from the messenger's message id to text.
     *
     * A separate call rather than a field on every message: the chat window shows live
     * messages fetched straight from the messenger, which know nothing about a transcript
     * computed here, and merging by id survives the switch between cached, archived and
     * live copies of the same conversation.
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
