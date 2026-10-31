package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.dto.ChatDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.model.enums.ChatKind;
import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import com.vitalii.messenger_hub_backend.repository.ChatRepository;
import com.vitalii.messenger_hub_backend.repository.MessengerAccountRepository;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

// ── MULTI-ACCOUNT TELEGRAM SERVICE ───────────────────────────────────────────
// Supports multiple Telegram accounts per user.
// All methods that operate on a specific chat accept an optional accountId.
// If accountId is null, the account is resolved from the chat DB record (fallback: first connected).
@Service
@RequiredArgsConstructor
@Slf4j
public class TelegramService {

    private final MessengerAccountRepository messengerAccountRepository;
    private final ChatRepository chatRepository;
    private final MessageRepository messageRepository;
    private final UserService userService;
    private final SimpMessagingTemplate messagingTemplate;
    private final RestTemplate restTemplate;
    private final MessageArchiveService messageArchiveService;

    @Value("${telegram.python.service.url:http://localhost:8201}")
    private String pythonServiceUrl;

    // ── AUTH ──────────────────────────────────────────────────────────────────

    public Map<String, Object> sendCode(String phone) {
        Map<String, String> request = Map.of("phone", phone);
        ResponseEntity<Map> response = restTemplate.postForEntity(
                pythonServiceUrl + "/auth/send-code", request, Map.class);
        return response.getBody();
    }

    @Transactional
    public Map<String, Object> signIn(Long userId, String phone, String code,
                                      String phoneCodeHash, String session) {
        Map<String, String> request = new HashMap<>();
        request.put("phone", phone);
        request.put("code", code);
        request.put("phone_code_hash", phoneCodeHash);
        request.put("session", session);

        ResponseEntity<Map> response = restTemplate.postForEntity(
                pythonServiceUrl + "/auth/sign-in", request, Map.class);

        Map<String, Object> result = response.getBody();
        Boolean requiresPassword = (Boolean) result.get("requires_password");
        if (Boolean.TRUE.equals(requiresPassword)) {
            return result;
        }
        saveAccount(userId, result);
        return result;
    }

    @Transactional
    public Map<String, Object> signInPassword(Long userId, String phone,
                                              String password, String session) {
        Map<String, String> request = new HashMap<>();
        request.put("phone", phone);
        request.put("password", password);
        request.put("session", session);

        ResponseEntity<Map> response = restTemplate.postForEntity(
                pythonServiceUrl + "/auth/sign-in-password", request, Map.class);

        Map<String, Object> result = response.getBody();
        saveAccount(userId, result);
        return result;
    }

    private void saveAccount(Long userId, Map<String, Object> result) {
        User user = userService.findById(userId);
        String sessionStr = (String) result.get("session");
        String username = (String) result.get("username");
        String firstName = (String) result.get("first_name");
        String externalUserId = String.valueOf(result.get("user_id"));

        // De-duplicate by Telegram user ID — allows multiple different accounts, prevents re-adding same one
        MessengerAccount account = messengerAccountRepository
                .findByUserIdAndMessengerTypeAndExternalUserId(userId, MessengerType.TELEGRAM, externalUserId)
                .orElse(MessengerAccount.builder()
                        .user(user)
                        .messengerType(MessengerType.TELEGRAM)
                        .build());

        account.setExternalUserId(externalUserId);
        account.setUsername(username != null ? username : firstName);
        account.setAccessToken(sessionStr);
        account.setIsConnected(true);
        account.setLastSyncAt(LocalDateTime.now());
        if (account.getAccountLabel() == null || account.getAccountLabel().isBlank()) {
            account.setAccountLabel(username != null ? "@" + username : firstName);
        }
        messengerAccountRepository.save(account);
    }

    // ── ACCOUNTS ──────────────────────────────────────────────────────────────

    public List<MessengerAccount> getTelegramAccounts(Long userId) {
        return messengerAccountRepository
                .findAllByUserIdAndMessengerType(userId, MessengerType.TELEGRAM)
                .stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsConnected()))
                .collect(Collectors.toList());
    }

    public MessengerAccount getTelegramAccount(Long userId) {
        return getTelegramAccounts(userId).stream().findFirst().orElse(null);
    }

    // ── CHATS ─────────────────────────────────────────────────────────────────

    @Transactional
    public List<ChatDTO> getUserChats(Long userId) {
        List<MessengerAccount> accounts = getTelegramAccounts(userId);
        if (accounts.isEmpty()) return List.of();
        List<ChatDTO> all = new ArrayList<>();
        for (MessengerAccount account : accounts) {
            try {
                all.addAll(getChatsByAccount(account));
            } catch (Exception e) {
                log.warn("Failed to fetch Telegram chats for account {}: {}", account.getId(), e.getMessage());
            }
        }
        return all;
    }

    @Transactional
    public List<ChatDTO> getUserChats(Long userId, Long accountId) {
        if (accountId == null) return getUserChats(userId);
        return getChatsByAccount(resolveAccount(userId, accountId));
    }

    private List<ChatDTO> getChatsByAccount(MessengerAccount account) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Session", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                pythonServiceUrl + "/chats", HttpMethod.GET, entity, List.class);
        List<Map<String, Object>> rawChats = response.getBody();
        if (rawChats == null) return List.of();

        List<Chat> existingChats = chatRepository.findAllByMessengerAccountId(account.getId());
        Map<String, Chat> chatByExternalId = new HashMap<>();
        for (Chat c : existingChats) chatByExternalId.put(c.getExternalChatId(), c);

        List<Chat> toSave = new ArrayList<>();
        List<ChatDTO> result = new ArrayList<>();

        for (Map<String, Object> raw : rawChats) {
            String externalChatId = cleanId(String.valueOf(raw.get("id")));
            String name = (String) raw.get("name");
            String type = (String) raw.get("type");
            // Reported by the messenger itself; null from a service that predates the field.
            ChatKind kind = ChatKind.parse((String) raw.get("kind"), type);
            String lastMessage = (String) raw.get("last_message");
            String lastMessageAtStr = (String) raw.get("last_message_at");
            Integer unreadCount = raw.get("unread_count") instanceof Number
                    ? ((Number) raw.get("unread_count")).intValue() : 0;

            Chat chat = chatByExternalId.get(externalChatId);
            if (chat == null) {
                chat = Chat.builder()
                        .user(account.getUser())
                        .messengerAccount(account)
                        .externalChatId(externalChatId)
                        .chatType(type != null ? type : "PERSONAL")
                        .chatKind(kind)
                        .name(name)
                        .unreadCount(0)
                        .isArchived(false)
                        .build();
            }
            chat.setName(name);
            chat.setChatKind(kind);
            chat.setUnreadCount(unreadCount);
            if (lastMessageAtStr != null) {
                try {
                    chat.setLastMessageAt(LocalDateTime.ofInstant(
                            java.time.Instant.parse(lastMessageAtStr),
                            java.time.ZoneId.systemDefault()));
                } catch (Exception ignored) {}
            }
            toSave.add(chat);
            result.add(ChatDTO.builder()
                    .id(chat.getId())
                    .messengerAccountId(account.getId())
                    .messengerType(MessengerType.TELEGRAM)
                    .externalChatId(externalChatId)
                    .chatType(chat.getChatType())
                    .chatKind(kind)
                    .name(name)
                    .unreadCount(unreadCount)
                    .lastMessage(lastMessage)
                    .lastMessageAt(chat.getLastMessageAt())
                    .isArchived(false)
                    .isPinned(chat.getIsPinned() != null && chat.getIsPinned())
                    .avatarBase64(chat.getAvatarBase64())
                    .build());
        }
        chatRepository.saveAll(toSave);
        return result;
    }

    public Map<String, Object> getAvatar(Long userId, String chatId) {
        MessengerAccount account = getAccountForChatOrFirst(userId, chatId, MessengerType.TELEGRAM);
        Optional<Chat> chatOpt = chatRepository
                .findByMessengerAccountIdAndExternalChatId(account.getId(), chatId);

        if (chatOpt.isPresent() && chatOpt.get().getAvatarBase64() != null) {
            return Map.of("avatar_base64", chatOpt.get().getAvatarBase64());
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Session", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    pythonServiceUrl + "/avatar?chat_id=" + chatId,
                    HttpMethod.GET, entity, Map.class);
            Map<String, Object> result = response.getBody();
            String avatarBase64 = result != null ? (String) result.get("avatar_base64") : null;
            if (avatarBase64 != null && chatOpt.isPresent()) {
                Chat chat = chatOpt.get();
                chat.setAvatarBase64(avatarBase64);
                chatRepository.save(chat);
            }
            return avatarBase64 != null ? Map.of("avatar_base64", avatarBase64) : Map.of("avatar_base64", "");
        } catch (Exception e) {
            log.warn("Failed to fetch avatar for {}: {}", chatId, e.getMessage());
            return Map.of("avatar_base64", "");
        }
    }

    @Transactional
    public boolean togglePinChat(Long userId, String externalChatId) {
        Chat chat = chatRepository.findFirstByUserIdAndExternalChatId(userId, externalChatId)
                .orElseThrow(() -> new RuntimeException("Chat not found"));
        boolean newState = !Boolean.TRUE.equals(chat.getIsPinned());
        chat.setIsPinned(newState);
        chatRepository.save(chat);
        log.info("Chat {} pinned={}", externalChatId, newState);
        return newState;
    }

    // ── MESSAGES ──────────────────────────────────────────────────────────────

    public List<MessageDTO> getChatMessages(String externalChatId, Long userId) {
        return getChatMessages(externalChatId, userId, 50, 0, 0, null);
    }

    public List<MessageDTO> getChatMessages(String externalChatId, Long userId, int limit, int offset) {
        return getChatMessages(externalChatId, userId, limit, offset, 0, null);
    }

    public List<MessageDTO> getChatMessages(String externalChatId, Long userId,
                                            int limit, int offset, int minId) {
        return getChatMessages(externalChatId, userId, limit, offset, minId, null);
    }

    public List<MessageDTO> getChatMessages(String externalChatId, Long userId,
                                            int limit, int offset, int minId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, externalChatId, MessengerType.TELEGRAM);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Session", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                pythonServiceUrl + "/messages?chat_id=" + externalChatId
                        + "&limit=" + limit + "&offset=" + offset,
                HttpMethod.GET, entity, List.class);

        List<Map<String, Object>> rawMessages = response.getBody();
        if (rawMessages == null) return List.of();

        List<MessageDTO> result = rawMessages.stream().map(raw -> {
            String timestampStr = (String) raw.get("timestamp");
            LocalDateTime timestamp;
            try {
                if (timestampStr != null && timestampStr.endsWith("Z")) {
                    timestamp = java.time.Instant.parse(timestampStr)
                            .atZone(java.time.ZoneId.systemDefault()).toLocalDateTime();
                } else if (timestampStr != null) {
                    timestamp = LocalDateTime.parse(timestampStr.substring(0, 19));
                } else {
                    timestamp = LocalDateTime.now();
                }
            } catch (Exception e) {
                timestamp = LocalDateTime.now();
            }

            Integer duration = null;
            Object durObj = raw.get("duration");
            if (durObj instanceof Number) duration = ((Number) durObj).intValue();

            Boolean isRead = null;
            Object isReadObj = raw.get("is_read");
            if (isReadObj instanceof Boolean) isRead = (Boolean) isReadObj;

            return MessageDTO.builder()
                    .externalMessageId(cleanId(String.valueOf(raw.get("id"))))
                    .text((String) raw.get("text"))
                    .senderId(cleanId(String.valueOf(raw.get("sender_id"))))
                    .senderName((String) raw.get("sender_name"))
                    .isFromUser((Boolean) raw.get("is_from_user"))
                    .timestamp(timestamp)
                    .mediaType((String) raw.get("media_type"))
                    .mediaBase64((String) raw.get("media_base64"))
                    .mediaMime((String) raw.get("media_mime"))
                    .fileName((String) raw.get("file_name"))
                    .duration(duration)
                    .isRead(isRead)
                    .replyToMessageId((String) raw.get("reply_to_msg_id"))
                    .replyToText((String) raw.get("reply_to_text"))
                    .replyToSenderName((String) raw.get("reply_to_sender_name"))
                    .build();
        }).collect(Collectors.toList());

        messageArchiveService.archive(account.getId(), externalChatId, result);
        return result;
    }

    public Map<String, Object> getMessageMedia(Long userId, String chatId, String messageId) {
        return getMessageMedia(userId, chatId, messageId, null);
    }

    public Map<String, Object> getMessageMedia(Long userId, String chatId, String messageId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId, MessengerType.TELEGRAM);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Session", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    pythonServiceUrl + "/message-media?chat_id=" + chatId + "&message_id=" + messageId,
                    HttpMethod.GET, entity, Map.class);
            return response.getBody();
        } catch (Exception e) {
            log.warn("Failed to fetch media for message {}: {}", messageId, e.getMessage());
            return Map.of("media_base64", "");
        }
    }

    // ── SEND ──────────────────────────────────────────────────────────────────

    public Map<String, Object> sendMessage(Long userId, String chatId, String text, String replyToMessageId) {
        return sendMessage(userId, chatId, text, replyToMessageId, null);
    }

    public Map<String, Object> sendMessage(Long userId, String chatId, String text,
                                           String replyToMessageId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId, MessengerType.TELEGRAM);

        Map<String, Object> request = new HashMap<>();
        request.put("session", account.getAccessToken());
        try {
            request.put("chat_id", Long.parseLong(cleanId(chatId)));
        } catch (NumberFormatException e) {
            throw new RuntimeException("Invalid chat ID: " + chatId);
        }
        request.put("text", text);
        if (replyToMessageId != null && !replyToMessageId.isBlank()) {
            request.put("reply_to_msg_id", Long.parseLong(cleanId(replyToMessageId)));
        }

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    pythonServiceUrl + "/send", request, Map.class);
            return response.getBody() != null ? response.getBody() : Map.of("success", true);
        } catch (Exception e) {
            throw new RuntimeException("Failed to send: " + e.getMessage());
        }
    }

    public Map<String, Object> sendMessage(Long userId, String chatId, String text) {
        return sendMessage(userId, chatId, text, null, null);
    }

    // ── SEND MEDIA ────────────────────────────────────────────────────────────

    /**
     * Sends an attachment — a picture, a file, or a voice note.
     *
     * The payload is forwarded as the validator produced it. Whether Telegram renders it as
     * a voice note rather than an audio file is decided in the Python service, which is the
     * only place that can repackage the container the browser recorded.
     */
    public Map<String, Object> sendMedia(Long userId, String chatId,
                                         MediaUploadValidator.ValidatedMedia media,
                                         Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId, MessengerType.TELEGRAM);

        Map<String, Object> request = new HashMap<>(media.toPayload());
        request.put("session", account.getAccessToken());
        try {
            request.put("chat_id", Long.parseLong(cleanId(chatId)));
        } catch (NumberFormatException e) {
            throw new RuntimeException("Invalid chat ID: " + chatId);
        }
        if (media.replyToMessageId() != null && !media.replyToMessageId().isBlank()) {
            request.put("reply_to_msg_id", Long.parseLong(cleanId(media.replyToMessageId())));
        }

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    pythonServiceUrl + "/send-media", request, Map.class);
            return response.getBody() != null ? response.getBody() : Map.of("success", true);
        } catch (Exception e) {
            log.warn("Telegram media send failed ({} bytes, {}): {}",
                    media.approximateBytes(), media.mimeType(), e.getMessage());
            throw new RuntimeException("Не вдалося надіслати вкладення: " + e.getMessage());
        }
    }

    // ── MARK READ ─────────────────────────────────────────────────────────────

    public void markAsRead(Long userId, String chatId) {
        markAsRead(userId, chatId, null);
    }

    public void markAsRead(Long userId, String chatId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId, MessengerType.TELEGRAM);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Session", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            restTemplate.exchange(pythonServiceUrl + "/mark-read?chat_id=" + chatId,
                    HttpMethod.POST, entity, Map.class);
            chatRepository.findByMessengerAccountIdAndExternalChatId(account.getId(), chatId)
                    .ifPresent(chat -> {
                        chat.setUnreadCount(0);
                        chatRepository.save(chat);
                    });
        } catch (Exception e) {
            log.warn("Failed to mark as read for chat {}: {}", chatId, e.getMessage());
        }
    }

    // ── STATUS ────────────────────────────────────────────────────────────────

    public Map<String, Object> getUserStatus(Long userId, String chatId) {
        return getUserStatus(userId, chatId, null);
    }

    public Map<String, Object> getUserStatus(Long userId, String chatId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId, MessengerType.TELEGRAM);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Session", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    pythonServiceUrl + "/user-status?chat_id=" + chatId,
                    HttpMethod.GET, entity, Map.class);
            return response.getBody();
        } catch (Exception e) {
            return Map.of("status", "unknown");
        }
    }

    // ── DISCONNECT ────────────────────────────────────────────────────────────

    @Transactional
    public void disconnect(Long userId) {
        disconnect(userId, null);
    }

    @Transactional
    public void disconnect(Long userId, Long accountId) {
        if (accountId != null) {
            messengerAccountRepository.findById(accountId)
                    .filter(a -> a.getUser().getId().equals(userId))
                    .ifPresent(account -> {
                        account.setIsConnected(false);
                        account.setAccessToken(null);
                        messengerAccountRepository.save(account);
                    });
        } else {
            getTelegramAccounts(userId).forEach(account -> {
                account.setIsConnected(false);
                account.setAccessToken(null);
                messengerAccountRepository.save(account);
            });
        }
        log.info("Telegram disconnected for user: {} accountId: {}", userId, accountId);
    }

    public void syncChats(MessengerAccount account) {
        getUserChats(account.getUser().getId());
    }

    // ── DELETE ────────────────────────────────────────────────────────────────

    public Map<String, Object> deleteMessage(Long userId, String chatId,
                                             String messageId, boolean revoke) {
        return deleteMessage(userId, chatId, messageId, revoke, null);
    }

    public Map<String, Object> deleteMessage(Long userId, String chatId,
                                             String messageId, boolean revoke, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId, MessengerType.TELEGRAM);

        Map<String, Object> request = new HashMap<>();
        request.put("session", account.getAccessToken());
        request.put("chat_id", Long.parseLong(cleanId(chatId)));
        request.put("message_id", Long.parseLong(cleanId(messageId)));
        request.put("revoke", revoke);

        ResponseEntity<Map> response = restTemplate.postForEntity(
                pythonServiceUrl + "/delete", request, Map.class);

        // Only after Telegram confirms: a failed delete upstream must leave the archive intact.
        messageArchiveService.forget(account.getId(), cleanId(chatId), cleanId(messageId));

        return response.getBody() != null ? response.getBody() : Map.of("success", true);
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    private MessengerAccount resolveAccount(Long userId, Long accountId) {
        MessengerAccount account = messengerAccountRepository.findById(accountId)
                .orElseThrow(() -> new CustomException("Account not found", HttpStatus.NOT_FOUND));
        if (!account.getUser().getId().equals(userId)) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }
        if (!Boolean.TRUE.equals(account.getIsConnected())) {
            throw new CustomException("Account is disconnected", HttpStatus.BAD_REQUEST);
        }
        return account;
    }

    private MessengerAccount getAccountForChatOrFirst(Long userId, String externalChatId, MessengerType type) {
        return chatRepository.findFirstByUserIdAndExternalChatId(userId, externalChatId)
                .map(Chat::getMessengerAccount)
                .orElseGet(() -> getFirstAccountOrThrow(userId, type));
    }

    private MessengerAccount getFirstAccountOrThrow(Long userId, MessengerType type) {
        return messengerAccountRepository
                .findAllByUserIdAndMessengerType(userId, type)
                .stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsConnected()))
                .findFirst()
                .orElseThrow(() -> new CustomException(type + " not connected", HttpStatus.NOT_FOUND));
    }

    private String cleanId(String id) {
        if (id == null) return null;
        int dot = id.indexOf('.');
        return dot >= 0 ? id.substring(0, dot) : id;
    }
}
