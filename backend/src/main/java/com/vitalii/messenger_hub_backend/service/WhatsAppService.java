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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class WhatsAppService {

    private final MessengerAccountRepository messengerAccountRepository;
    private final ChatRepository chatRepository;
    private final UserService userService;
    private final RestTemplate restTemplate;
    private final MessageArchiveService messageArchiveService;

    @Value("${whatsapp.node.service.url:http://localhost:8204}")
    private String nodeServiceUrl;

    // ── INIT SESSION ──────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> initSession(Long userId) {
        Map<String, Object> body = new HashMap<>();
        ResponseEntity<Map> response = restTemplate.postForEntity(
                nodeServiceUrl + "/init-session", body, Map.class);
        Map<String, Object> result = response.getBody();
        log.info("WhatsApp init session for user: {}, sessionId: {}", userId,
                result != null ? result.get("sessionId") : null);
        return result != null ? result : Map.of();
    }

    // ── CHECK SESSION STATUS (saves account when connected) ───────────────────

    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> checkSession(Long userId, String sessionId) {
        ResponseEntity<Map> response = restTemplate.getForEntity(
                nodeServiceUrl + "/status?sessionId=" + sessionId, Map.class);
        Map<String, Object> nodeResult = response.getBody();
        if (nodeResult == null) return Map.of("status", "failed");

        String status = (String) nodeResult.get("status");
        Map<String, Object> result = new HashMap<>();
        result.put("status", status);
        result.put("qrBase64", nodeResult.get("qr"));

        if ("connected".equals(status)) {
            Map<String, Object> info = (Map<String, Object>) nodeResult.get("info");
            if (info != null) {
                String phone = (String) info.get("phone");
                String name = (String) info.get("name");

                User user = userService.findById(userId);
                MessengerAccount account = messengerAccountRepository
                        .findByUserIdAndMessengerTypeAndExternalUserId(userId, MessengerType.WHATSAPP, phone)
                        .orElse(MessengerAccount.builder()
                                .user(user)
                                .messengerType(MessengerType.WHATSAPP)
                                .build());

                account.setExternalUserId(phone);
                account.setUsername(name);
                account.setAccessToken(sessionId);
                account.setIsConnected(true);
                account.setLastSyncAt(LocalDateTime.now());
                if (account.getAccountLabel() == null || account.getAccountLabel().isBlank()) {
                    account.setAccountLabel(name);
                }
                messengerAccountRepository.save(account);
                log.info("WhatsApp account saved: userId={} phone={}", userId, phone);

                result.put("accountId", account.getId());
                result.put("username", name);
                result.put("phone", phone);
            }
        }
        return result;
    }

    // ── ACCOUNTS ──────────────────────────────────────────────────────────────

    public List<MessengerAccount> getWhatsAppAccounts(Long userId) {
        return messengerAccountRepository
                .findAllByUserIdAndMessengerType(userId, MessengerType.WHATSAPP)
                .stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsConnected()))
                .collect(Collectors.toList());
    }

    // ── CHATS ─────────────────────────────────────────────────────────────────

    @Transactional
    @SuppressWarnings("unchecked")
    public List<ChatDTO> getUserChats(Long userId) {
        List<MessengerAccount> accounts = getWhatsAppAccounts(userId);
        if (accounts.isEmpty()) return List.of();
        List<ChatDTO> all = new ArrayList<>();
        for (MessengerAccount account : accounts) {
            try {
                all.addAll(getChatsByAccount(account));
            } catch (Exception e) {
                log.warn("Failed to fetch WhatsApp chats for account {}: {}", account.getId(), e.getMessage());
            }
        }
        return all;
    }

    @SuppressWarnings("unchecked")
    private List<ChatDTO> getChatsByAccount(MessengerAccount account) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                nodeServiceUrl + "/chats", HttpMethod.GET, entity, List.class);
        List<Map<String, Object>> rawChats = response.getBody();
        if (rawChats == null) return List.of();

        List<ChatDTO> result = new ArrayList<>();
        for (Map<String, Object> raw : rawChats) {
            String externalChatId = (String) raw.get("id");
            String name = (String) raw.get("name");
            String type = (String) raw.get("type");
            // Reported by the messenger itself; null from a service that predates the field.
            ChatKind kind = ChatKind.parse((String) raw.get("kind"), type);
            String lastMessage = (String) raw.get("last_message");
            String lastMessageAt = (String) raw.get("last_message_at");
            Object unreadObj = raw.get("unread_count");
            int unreadCount = unreadObj instanceof Number ? ((Number) unreadObj).intValue() : 0;

            Chat chat = chatRepository.findByMessengerAccountIdAndExternalChatId(
                            account.getId(), externalChatId)
                    .orElseGet(() -> chatRepository.save(Chat.builder()
                            .user(account.getUser())
                            .messengerAccount(account)
                            .externalChatId(externalChatId)
                            .chatType(type != null ? type : "PERSONAL")
                            .chatKind(kind)
                            .name(name)
                            .unreadCount(0)
                            .isArchived(false)
                            .build()));

            chat.setName(name);

            chat.setChatKind(kind);
            chat.setUnreadCount(unreadCount);
            if (lastMessageAt != null) {
                try {
                    chat.setLastMessageAt(LocalDateTime.ofInstant(
                            Instant.parse(lastMessageAt), ZoneId.systemDefault()));
                } catch (Exception ignored) {}
            }
            chatRepository.save(chat);

            result.add(ChatDTO.builder()
                    .id(chat.getId())
                    .messengerAccountId(account.getId())
                    .messengerType(MessengerType.WHATSAPP)
                    .externalChatId(externalChatId)
                    .chatType(chat.getChatType())
                    .chatKind(kind)
                    .name(name)
                    .unreadCount(unreadCount)
                    .lastMessage(lastMessage)
                    .lastMessageAt(chat.getLastMessageAt())
                    .isArchived(false)
                    .build());
        }
        return result;
    }

    // ── MESSAGES ──────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<MessageDTO> getChatMessages(String externalChatId, Long userId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, externalChatId);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                nodeServiceUrl + "/messages?chat_id=" + externalChatId + "&limit=50",
                HttpMethod.GET, entity, List.class);
        List<Map<String, Object>> rawMessages = response.getBody();
        if (rawMessages == null) return List.of();

        List<MessageDTO> result = rawMessages.stream().map(raw -> {
            String timestampStr = (String) raw.get("timestamp");
            LocalDateTime timestamp;
            try {
                timestamp = LocalDateTime.ofInstant(Instant.parse(timestampStr), ZoneId.systemDefault());
            } catch (Exception e) {
                timestamp = LocalDateTime.now();
            }
            return MessageDTO.builder()
                    .externalMessageId(String.valueOf(raw.get("id")))
                    .text((String) raw.get("text"))
                    .senderId((String) raw.get("sender_id"))
                    .senderName((String) raw.get("sender_name"))
                    .isFromUser((Boolean) raw.get("is_from_user"))
                    .timestamp(timestamp)
                    .build();
        }).collect(Collectors.toList());

        messageArchiveService.archive(account.getId(), externalChatId, result);
        return result;
    }

    // ── SEND ──────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public void sendMessage(Long userId, String chatId, String text, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId);

        Map<String, Object> request = new HashMap<>();
        request.put("token", account.getAccessToken());
        request.put("chat_id", chatId);
        request.put("text", text);

        restTemplate.postForEntity(nodeServiceUrl + "/send", request, Map.class);
        log.info("WhatsApp message sent to chat: {}", chatId);
    }

    /**
     * Sends an attachment. WhatsApp distinguishes voice notes from audio files, so the kind changes
     * what the recipient sees.
     */
    public void sendMedia(Long userId, String chatId,
                          MediaUploadValidator.ValidatedMedia media, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId);

        Map<String, Object> request = new HashMap<>(media.toPayload());
        request.put("token", account.getAccessToken());
        request.put("chat_id", chatId);

        restTemplate.postForEntity(nodeServiceUrl + "/send-media", request, Map.class);
        log.info("WhatsApp media sent to chat {} ({} bytes)", chatId, media.approximateBytes());
    }


    // ── DELETE ────────────────────────────────────────────────────────────────

    /** Deletes a message for everyone, and the archived copy only after WhatsApp confirms. */
    public void deleteMessage(Long userId, String chatId, String messageId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, chatId);

        Map<String, Object> request = new HashMap<>();
        request.put("token", account.getAccessToken());
        request.put("chat_id", chatId);
        request.put("message_id", messageId);

        restTemplate.postForEntity(nodeServiceUrl + "/delete", request, Map.class);
        messageArchiveService.forget(account.getId(), chatId, messageId);
        log.info("WhatsApp message {} deleted", messageId);
    }

    // ── DISCONNECT ────────────────────────────────────────────────────────────

    @Transactional
    public void disconnect(Long userId, Long accountId) {
        if (accountId != null) {
            messengerAccountRepository.findById(accountId)
                    .filter(a -> a.getUser().getId().equals(userId))
                    .ifPresent(a -> {
                        disconnectNode(a.getAccessToken());
                        a.setIsConnected(false);
                        a.setAccessToken(null);
                        messengerAccountRepository.save(a);
                    });
        } else {
            getWhatsAppAccounts(userId).forEach(a -> {
                disconnectNode(a.getAccessToken());
                a.setIsConnected(false);
                a.setAccessToken(null);
                messengerAccountRepository.save(a);
            });
        }
        log.info("WhatsApp disconnected for user: {} accountId: {}", userId, accountId);
    }

    private void disconnectNode(String token) {
        if (token == null) return;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Token", token);
            restTemplate.postForEntity(nodeServiceUrl + "/disconnect",
                    new HttpEntity<>(headers), Map.class);
        } catch (Exception e) {
            log.warn("WhatsApp node disconnect failed: {}", e.getMessage());
        }
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    private MessengerAccount resolveAccount(Long userId, Long accountId) {
        MessengerAccount account = messengerAccountRepository.findById(accountId)
                .orElseThrow(() -> new CustomException("Account not found", HttpStatus.NOT_FOUND));
        if (!account.getUser().getId().equals(userId))
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        if (!Boolean.TRUE.equals(account.getIsConnected()))
            throw new CustomException("Account is disconnected", HttpStatus.BAD_REQUEST);
        return account;
    }

    private MessengerAccount getAccountForChatOrFirst(Long userId, String externalChatId) {
        return chatRepository.findFirstByUserIdAndExternalChatId(userId, externalChatId)
                .map(Chat::getMessengerAccount)
                .orElseGet(() -> messengerAccountRepository
                        .findAllByUserIdAndMessengerType(userId, MessengerType.WHATSAPP)
                        .stream()
                        .filter(a -> Boolean.TRUE.equals(a.getIsConnected()))
                        .findFirst()
                        .orElseThrow(() -> new CustomException("WhatsApp not connected", HttpStatus.NOT_FOUND)));
    }
}
