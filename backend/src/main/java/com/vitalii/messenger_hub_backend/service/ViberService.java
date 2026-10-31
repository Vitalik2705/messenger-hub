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
public class ViberService {

    private final MessengerAccountRepository messengerAccountRepository;
    private final ChatRepository chatRepository;
    private final UserService userService;
    private final RestTemplate restTemplate;
    private final MessageArchiveService messageArchiveService;

    @Value("${viber.python.service.url:http://localhost:8205}")
    private String pythonServiceUrl;

    // ── CONNECT ───────────────────────────────────────────────────────────────

    @Transactional
    @SuppressWarnings("unchecked")
    public MessengerAccount connectViber(Long userId, String token) {
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
                .findByUserIdAndMessengerTypeAndExternalUserId(userId, MessengerType.VIBER, externalUserId)
                .orElse(MessengerAccount.builder()
                        .user(user)
                        .messengerType(MessengerType.VIBER)
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
        log.info("Viber connected for user: {} account: {}", userId, username);
        return account;
    }

    // ── ACCOUNTS ──────────────────────────────────────────────────────────────

    public List<MessengerAccount> getViberAccounts(Long userId) {
        return messengerAccountRepository
                .findAllByUserIdAndMessengerType(userId, MessengerType.VIBER)
                .stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsConnected()))
                .collect(Collectors.toList());
    }

    // ── CHATS ─────────────────────────────────────────────────────────────────

    @Transactional
    @SuppressWarnings("unchecked")
    public List<ChatDTO> getUserChats(Long userId) {
        List<MessengerAccount> accounts = getViberAccounts(userId);
        if (accounts.isEmpty()) return List.of();
        List<ChatDTO> all = new ArrayList<>();
        for (MessengerAccount account : accounts) {
            try {
                all.addAll(getChatsByAccount(account));
            } catch (Exception e) {
                log.warn("Failed to fetch Viber chats for account {}: {}", account.getId(), e.getMessage());
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
                pythonServiceUrl + "/chats", HttpMethod.GET, entity, List.class);
        List<Map<String, Object>> rawChats = response.getBody();
        if (rawChats == null) return List.of();

        List<ChatDTO> result = new ArrayList<>();
        for (Map<String, Object> raw : rawChats) {
            String externalChatId = (String) raw.get("id");
            String name = (String) raw.get("name");
            String lastMessage = (String) raw.get("last_message");
            String lastMessageAt = (String) raw.get("last_message_at");
            // A Viber bot only ever sees the people who wrote to it, so PERSONAL is the
            // only chat type here — but the kind still comes from the service, not a
            // constant, so an un-upgraded service degrades to the same answer.
            ChatKind kind = ChatKind.parse((String) raw.get("kind"), "PERSONAL");

            Chat chat = chatRepository.findByMessengerAccountIdAndExternalChatId(
                            account.getId(), externalChatId)
                    .orElseGet(() -> chatRepository.save(Chat.builder()
                            .user(account.getUser())
                            .messengerAccount(account)
                            .externalChatId(externalChatId)
                            .chatType("PERSONAL")
                            .chatKind(kind)
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
                    .messengerType(MessengerType.VIBER)
                    .externalChatId(externalChatId)
                    .chatType("PERSONAL")
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

    @SuppressWarnings("unchecked")
    public List<MessageDTO> getChatMessages(String externalChatId, Long userId, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, externalChatId);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                pythonServiceUrl + "/messages?user_id=" + externalChatId,
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
    public void sendMessage(Long userId, String viberUserId, String text, Long accountId) {
        MessengerAccount account = accountId != null
                ? resolveAccount(userId, accountId)
                : getAccountForChatOrFirst(userId, viberUserId);

        Map<String, Object> request = new HashMap<>();
        request.put("token", account.getAccessToken());
        request.put("user_id", viberUserId);
        request.put("text", text);

        restTemplate.postForEntity(pythonServiceUrl + "/send", request, Map.class);
        log.info("Viber message sent to user: {}", viberUserId);
    }

    /**
     * Not supported, and not for lack of plumbing.
     *
     * The Viber bot API accepts media only as a public URL it can fetch itself — there is no
     * upload endpoint to send bytes to. Supporting this would mean hosting every attachment
     * somewhere publicly reachable, which is a different feature with its own privacy
     * consequences, not a missing parameter here.
     *
     * Failing loudly beats a send that silently does nothing.
     */
    public void sendMedia(Long userId, String viberUserId,
                          MediaUploadValidator.ValidatedMedia media, Long accountId) {
        throw new UnsupportedOperationException(
                "Viber не приймає вкладення напряму — його API бере медіа лише за публічним посиланням");
    }

    // ── DELETE ────────────────────────────────────────────────────────────────

    /**
     * Not supported. The Viber bot API has no endpoint for removing a sent message, so
     * there is nothing to call — a bot can only stop sending, never take back.
     */
    public void deleteMessage(Long userId, String viberUserId, String messageId, Long accountId) {
        throw new UnsupportedOperationException(
                "Viber не дозволяє видаляти надіслані повідомлення через API бота");
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
            getViberAccounts(userId).forEach(a -> {
                a.setIsConnected(false);
                a.setAccessToken(null);
                messengerAccountRepository.save(a);
            });
        }
        log.info("Viber disconnected for user: {} accountId: {}", userId, accountId);
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
                        .findAllByUserIdAndMessengerType(userId, MessengerType.VIBER)
                        .stream()
                        .filter(a -> Boolean.TRUE.equals(a.getIsConnected()))
                        .findFirst()
                        .orElseThrow(() -> new CustomException("Viber not connected", HttpStatus.NOT_FOUND)));
    }
}
