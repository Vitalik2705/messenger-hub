package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.controller.WebSocketController;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.entity.Message;
import com.vitalii.messenger_hub_backend.repository.ChatRepository;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Stores messages that pass through the platform, so history accumulates locally. Archiving is a
 * side effect of reading and must never break the read: failures are swallowed and the work has its
 * own transaction.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MessageArchiveService {

    /** Media payloads are not archived — only the fact that media was attached. */
    private static final int MAX_TEXT_LENGTH = 20_000;

    private final MessageRepository messageRepository;
    private final ChatRepository chatRepository;
    private final WebSocketController webSocketController;
    private final org.springframework.context.ApplicationEventPublisher events;
    /**
     * Self-reference through the container, so calls to store() go through the proxy and keep
     * REQUIRES_NEW.
     */
    private final ObjectProvider<MessageArchiveService> self;

    /**
     * Archives a batch fetched for a chat identified by its external ID.
     * Silently does nothing if the chat has not been synced into the DB yet.
     */
    /** Someone wrote to the user in this chat, and it has just been archived. */
    public record IncomingMessages(Long chatId) {}

    public void archive(Long messengerAccountId, String externalChatId, List<MessageDTO> messages) {
        if (messages == null || messages.isEmpty()) return;
        try {
            Optional<Chat> chat = chatRepository
                    .findByMessengerAccountIdAndExternalChatId(messengerAccountId, externalChatId);
            if (chat.isEmpty()) {
                log.debug("Skipping archive: chat {} of account {} is not synced yet",
                        externalChatId, messengerAccountId);
                return;
            }
            StoreResult result = self.getObject().store(chat.get(), messages);
            if (result.newMessages().isEmpty() || result.userEmail() == null) return;

            log.info("Archived {} new message(s) for chat {} (account {})",
                    result.newMessages().size(), externalChatId, messengerAccountId);

            // Anything newly archived is news to the client — including messages the
            // background archiver found while the user was looking at a different chat.
            for (MessageDTO stored : result.newMessages()) {
                webSocketController.notifyNewMessage(result.userEmail(), stored);
            }

            // Published rather than called: generating a reply takes tens of seconds on a
            // CPU, and archiving must not wait on it. The listener decides whether this
            // chat wants one at all.
            boolean fromCounterpart = result.newMessages().stream()
                    .anyMatch(message -> !Boolean.TRUE.equals(message.getIsFromUser()));
            if (fromCounterpart) {
                events.publishEvent(new IncomingMessages(chat.get().getId()));
            }
        } catch (Exception e) {
            // Archiving is best-effort: a failure here must not surface to the user.
            log.warn("Failed to archive messages for chat {} (account {}): {}",
                    externalChatId, messengerAccountId, e.getMessage());
        }
    }

    /** Its own transaction, so a failure cannot roll back the caller's work. */
    /** What was actually written, plus the owner to notify. */
    /**
     * Drops the archived copy of a message deleted in the messenger. Called only after the
     * messenger confirmed; failures are logged, not raised, since the deletion itself succeeded.
     */
    @Transactional
    public void forget(Long messengerAccountId, String externalChatId, String externalMessageId) {
        if (externalMessageId == null || externalMessageId.isBlank()) return;
        try {
            chatRepository.findByMessengerAccountIdAndExternalChatId(messengerAccountId, externalChatId)
                    .ifPresent(chat -> {
                        int removed = messageRepository.deleteArchived(chat.getId(), externalMessageId);
                        if (removed > 0) {
                            log.info("Forgot archived message {} in chat {}", externalMessageId, chat.getId());
                        }
                    });
        } catch (Exception e) {
            log.warn("Failed to forget archived message {}: {}", externalMessageId, e.getMessage());
        }
    }

    /** After an edit succeeds upstream: the archive keeps what the message says now. */
    public void rewrite(Long messengerAccountId, String externalChatId, String externalMessageId, String text) {
        try {
            chatRepository.findByMessengerAccountIdAndExternalChatId(messengerAccountId, externalChatId)
                    .ifPresent(chat -> messageRepository.updateArchivedText(chat.getId(), externalMessageId, text));
        } catch (Exception e) {
            log.warn("Failed to rewrite archived message {}: {}", externalMessageId, e.getMessage());
        }
    }

    public record StoreResult(String userEmail, List<MessageDTO> newMessages) {
        static StoreResult empty() {
            return new StoreResult(null, List.of());
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public StoreResult store(Chat chat, List<MessageDTO> messages) {
        // Keep the newest occurrence of each external ID within the batch.
        Map<String, MessageDTO> byExternalId = new LinkedHashMap<>();
        for (MessageDTO dto : messages) {
            String externalId = dto.getExternalMessageId();
            if (externalId == null || externalId.isBlank() || "null".equals(externalId)) continue;
            byExternalId.put(externalId, dto);
        }
        if (byExternalId.isEmpty()) return StoreResult.empty();

        Set<String> alreadyStored = new HashSet<>(
                messageRepository.findExistingExternalIds(chat.getId(), byExternalId.keySet()));

        List<Message> toInsert = new ArrayList<>();
        for (Map.Entry<String, MessageDTO> entry : byExternalId.entrySet()) {
            if (alreadyStored.contains(entry.getKey())) continue;
            toInsert.add(toEntity(chat, entry.getKey(), entry.getValue()));
        }
        if (toInsert.isEmpty()) return StoreResult.empty();

        List<Message> saved = messageRepository.saveAll(toInsert);

        // Queried, not navigated. The Chat arrives detached, so chat.getUser() is a proxy
        // with no session behind it and throws on every caller that is not an HTTP thread.
        String userEmail = chatRepository.findOwnerEmail(chat.getId()).orElse(null);

        List<MessageDTO> published = new ArrayList<>(saved.size());
        for (Message message : saved) {
            MessageDTO source = byExternalId.get(message.getExternalMessageId());
            published.add(toPublishedDto(message, chat, source));
        }
        return new StoreResult(userEmail, published);
    }

    /**
     * Merges the stored row's identifiers (chatId, id) into the fetched DTO, which carries the
     * presentation fields.
     */
    private MessageDTO toPublishedDto(Message message, Chat chat, MessageDTO source) {
        return MessageDTO.builder()
                .id(message.getId())
                .chatId(chat.getId())
                .externalMessageId(message.getExternalMessageId())
                .text(message.getText())
                .senderId(message.getSenderId())
                .senderName(message.getSenderName())
                .isFromUser(message.getIsFromUser())
                .status(message.getStatus())
                .timestamp(message.getTimestamp())
                .isRead(source != null ? source.getIsRead() : null)
                .mediaType(source != null ? source.getMediaType() : null)
                .mediaMime(source != null ? source.getMediaMime() : null)
                .fileName(source != null ? source.getFileName() : null)
                .duration(source != null ? source.getDuration() : null)
                .replyToMessageId(source != null ? source.getReplyToMessageId() : null)
                .replyToText(source != null ? source.getReplyToText() : null)
                .replyToSenderName(source != null ? source.getReplyToSenderName() : null)
                .build();
    }

    private Message toEntity(Chat chat, String externalId, MessageDTO dto) {
        return Message.builder()
                .chat(chat)
                .externalMessageId(externalId)
                .text(truncate(dto.getText()))
                .senderId(dto.getSenderId())
                .senderName(dto.getSenderName())
                .isFromUser(Boolean.TRUE.equals(dto.getIsFromUser()))
                .status(Boolean.TRUE.equals(dto.getIsRead()) ? "READ" : null)
                .attachments(describeAttachment(dto))
                .timestamp(dto.getTimestamp())
                .build();
    }

    /** Only media metadata is archived, never the base64 bytes. Null when there is no media. */
    private String describeAttachment(MessageDTO dto) {
        if (dto.getMediaType() == null || dto.getMediaType().isBlank()) return null;
        StringBuilder json = new StringBuilder("{\"type\":\"").append(escape(dto.getMediaType())).append('"');
        if (dto.getMediaMime() != null) json.append(",\"mime\":\"").append(escape(dto.getMediaMime())).append('"');
        if (dto.getFileName() != null) json.append(",\"fileName\":\"").append(escape(dto.getFileName())).append('"');
        if (dto.getDuration() != null) json.append(",\"duration\":").append(dto.getDuration());
        return json.append('}').toString();
    }

    private String truncate(String text) {
        if (text == null) return null;
        return text.length() <= MAX_TEXT_LENGTH ? text : text.substring(0, MAX_TEXT_LENGTH);
    }

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
