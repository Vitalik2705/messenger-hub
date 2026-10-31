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
public class DiscordService {

    private final MessengerAccountRepository messengerAccountRepository;
    private final ChatRepository chatRepository;
    private final UserService userService;
    private final RestTemplate restTemplate;
    private final MessageArchiveService messageArchiveService;

    @Value("${discord.python.service.url:http://localhost:8203}")
    private String pythonServiceUrl;

    // ── CONNECT ───────────────────────────────────────────────────────────────

    @Transactional
    public MessengerAccount connectDiscord(Long userId, String token) {
        User user = userService.findById(userId);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", token);
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<Map> response = restTemplate.exchange(
                pythonServiceUrl + "/validate", HttpMethod.GET, entity, Map.class);

        Map<String, Object> info = response.getBody();
        String externalUserId = (String) info.get("user_id");
        String username = (String) info.get("username");

        MessengerAccount account = messengerAccountRepository
                .findByUserIdAndMessengerTypeAndExternalUserId(userId, MessengerType.DISCORD, externalUserId)
                .orElse(MessengerAccount.builder()
                        .user(user)
                        .messengerType(MessengerType.DISCORD)
                        .build());

        account.setExternalUserId(externalUserId);
        account.setUsername(username);
        account.setAccessToken(token);
        account.setIsConnected(true);
        account.setLastSyncAt(LocalDateTime.now());
        if (account.getAccountLabel() == null || account.getAccountLabel().isBlank()) {
            account.setAccountLabel(username);
        }
        messengerAccountRepository.save(account);
        log.info("Discord connected for user: {} account: {}", userId, username);
        return account;
    }

    // ── ACCOUNTS ──────────────────────────────────────────────────────────────

    public List<MessengerAccount> getDiscordAccounts(Long userId) {
        return messengerAccountRepository
                .findAllByUserIdAndMessengerType(userId, MessengerType.DISCORD)
                .stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsConnected()))
                .collect(Collectors.toList());
    }

    public MessengerAccount getDiscordAccount(Long userId) {
        return getDiscordAccounts(userId).stream().findFirst().orElse(null);
    }

    // ── CHATS ─────────────────────────────────────────────────────────────────

    @Transactional
    public List<ChatDTO> getUserChats(Long userId) {
        List<MessengerAccount> accounts = getDiscordAccounts(userId);
        if (accounts.isEmpty()) return List.of();
        List<ChatDTO> all = new ArrayList<>();
        for (MessengerAccount account : accounts) {
            try {
                all.addAll(getChatsByAccount(account));
            } catch (Exception e) {
                log.warn("Failed to fetch Discord chats for account {}: {}", account.getId(), e.getMessage());
            }
        }
        return all;
    }

    private List<ChatDTO> getChatsByAccount(MessengerAccount account) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                pythonServiceUrl + "/chats", HttpMethod.GET, entity, List.class);
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

            Chat chat = chatRepository.findByMessengerAccountIdAndExternalChatId(
                            account.getId(), externalChatId)
                    .orElseGet(() -> chatRepository.save(Chat.builder()
                            .user(account.getUser())
                            .messengerAccount(account)
                            .externalChatId(externalChatId)
                            .chatType(type != null ? type : "GROUP")
                            .name(name)
                            .unreadCount(0)
                            .isArchived(false)
                            .build()));

            chat.setName(name);

            chat.setChatKind(kind);
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
                    .messengerType(MessengerType.DISCORD)
                    .externalChatId(externalChatId)
                    .chatType(chat.getChatType())
                    .chatKind(kind)
                    .name(name)
                    .unreadCount(0)
                    .lastMessage(lastMessage)
                    .lastMessageAt(chat.getLastMessageAt())
                    .isArchived(false)
                    .build());
        }
        return result;
    }

    // ── MESSAGES ──────────────────────────────────────────────────────────────

    @Transactional
    public List<MessageDTO> getChatMessages(String externalChatId, Long userId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, externalChatId, MessengerType.DISCORD);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                pythonServiceUrl + "/messages?channel_id=" + externalChatId + "&limit=50",
                HttpMethod.GET, entity, List.class);
        List<Map<String, Object>> rawMessages = response.getBody();
        if (rawMessages == null) return List.of();

        List<MessageDTO> result = rawMessages.stream().map(raw -> {
            String timestampStr = (String) raw.get("timestamp");
            LocalDateTime timestamp;
            try {
                timestamp = LocalDateTime.ofInstant(
                        Instant.parse(timestampStr), ZoneId.systemDefault());
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

    public void sendMessage(Long userId, String channelId, String text, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, channelId, MessengerType.DISCORD);

        Map<String, Object> request = new HashMap<>();
        request.put("token", account.getAccessToken());
        request.put("channel_id", channelId);
        request.put("text", text);

        restTemplate.postForEntity(pythonServiceUrl + "/send", request, Map.class);
        log.info("Discord message sent to channel: {}", channelId);
    }

    /**
     * Uploads an attachment to a channel.
     *
     * Discord takes any file and plays audio inline itself, so a recording needs no special
     * handling here — unlike Telegram, there is no separate voice-note type to qualify for.
     */
    public void sendMedia(Long userId, String channelId,
                          MediaUploadValidator.ValidatedMedia media, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, channelId, MessengerType.DISCORD);

        Map<String, Object> request = new HashMap<>(media.toPayload());
        request.put("token", account.getAccessToken());
        request.put("channel_id", channelId);

        restTemplate.postForEntity(pythonServiceUrl + "/send-media", request, Map.class);
        log.info("Discord media sent to channel {} ({} bytes)", channelId, media.approximateBytes());
    }


    // ── DELETE ────────────────────────────────────────────────────────────────

    /**
     * Deletes a message for everyone, then drops the archived copy.
     *
     * Order matters: if Discord refuses the deletion the local copy is still the truth,
     * so the archive is only cleaned once the messenger has confirmed.
     */
    public void deleteMessage(Long userId, String channelId, String messageId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, channelId, MessengerType.DISCORD);

        Map<String, Object> request = new HashMap<>();
        request.put("token", account.getAccessToken());
        request.put("channel_id", channelId);
        request.put("message_id", messageId);

        restTemplate.postForEntity(pythonServiceUrl + "/delete", request, Map.class);
        messageArchiveService.forget(account.getId(), channelId, messageId);
        log.info("Discord message {} deleted", messageId);
    }

    // ── DISCONNECT ────────────────────────────────────────────────────────────

    @Transactional
    public void disconnect(Long userId, Long accountId) {
        if (accountId != null) {
            messengerAccountRepository.findById(accountId)
                    .filter(a -> a.getUser().getId().equals(userId))
                    .ifPresent(a -> {
                        a.setIsConnected(false);
                        a.setAccessToken(null);
                        messengerAccountRepository.save(a);
                    });
        } else {
            getDiscordAccounts(userId).forEach(a -> {
                a.setIsConnected(false);
                a.setAccessToken(null);
                messengerAccountRepository.save(a);
            });
        }
        log.info("Discord disconnected for user: {} accountId: {}", userId, accountId);
    }

    public void syncChats(MessengerAccount account) {
        getUserChats(account.getUser().getId());
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
}
