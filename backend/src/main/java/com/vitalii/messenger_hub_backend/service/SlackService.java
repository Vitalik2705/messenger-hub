package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.dto.ChatDTO;
import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import com.vitalii.messenger_hub_backend.repository.ChatRepository;
import com.vitalii.messenger_hub_backend.repository.MessengerAccountRepository;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
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
public class SlackService {

    private final MessengerAccountRepository messengerAccountRepository;
    private final ChatRepository chatRepository;
    private final MessageRepository messageRepository;
    private final UserService userService;
    private final RestTemplate restTemplate;

    @Value("${slack.python.service.url:http://localhost:8002}")
    private String pythonServiceUrl;

    @Transactional
    public MessengerAccount connectSlack(Long userId, String token) {
        User user = userService.findById(userId);

        // Validate token and get user info
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", token);
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<Map> response = restTemplate.exchange(
                pythonServiceUrl + "/validate",
                HttpMethod.GET, entity, Map.class);

        Map<String, Object> info = response.getBody();
        String externalUserId = (String) info.get("user_id");
        String username = (String) info.get("username");

        MessengerAccount account = messengerAccountRepository
                .findByUserIdAndMessengerType(userId, MessengerType.SLACK)
                .orElse(MessengerAccount.builder()
                        .user(user)
                        .messengerType(MessengerType.SLACK)
                        .build());

        account.setExternalUserId(externalUserId);
        account.setUsername(username);
        account.setAccessToken(token);
        account.setIsConnected(true);
        account.setLastSyncAt(LocalDateTime.now());
        messengerAccountRepository.save(account);

        log.info("Slack connected for user: {}", userId);
        return account;
    }

    @Transactional
    public List<ChatDTO> getUserChats(Long userId) {
        MessengerAccount account = getAccountOrThrow(userId);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                pythonServiceUrl + "/chats",
                HttpMethod.GET, entity, List.class);
        List<Map<String, Object>> rawChats = response.getBody();

        List<ChatDTO> result = new ArrayList<>();
        for (Map<String, Object> raw : rawChats) {
            String externalChatId = (String) raw.get("id");
            String name = (String) raw.get("name");
            String type = (String) raw.get("type");
            String lastMessage = (String) raw.get("last_message");
            String lastMessageAt = (String) raw.get("last_message_at");

            Chat chat = chatRepository.findByMessengerAccountIdAndExternalChatId(
                            account.getId(), externalChatId)
                    .orElseGet(() -> chatRepository.save(Chat.builder()
                            .user(account.getUser())
                            .messengerAccount(account)
                            .externalChatId(externalChatId)
                            .chatType(type != null ? type : "PERSONAL")
                            .name(name)
                            .unreadCount(0)
                            .isArchived(false)
                            .build()));

            chat.setName(name);
            if (lastMessageAt != null) {
                try {
                    chat.setLastMessageAt(LocalDateTime.ofInstant(
                            Instant.parse(lastMessageAt), ZoneId.systemDefault()));
                } catch (Exception ignored) {}
            }
            chatRepository.save(chat);

            result.add(ChatDTO.builder()
                    .id(chat.getId())
                    .messengerType(MessengerType.SLACK)
                    .externalChatId(externalChatId)
                    .chatType(chat.getChatType())
                    .name(name)
                    .unreadCount((Integer) raw.getOrDefault("unread_count", 0))
                    .lastMessage(lastMessage)
                    .lastMessageAt(chat.getLastMessageAt())
                    .isArchived(false)
                    .build());
        }
        return result;
    }

    @Transactional
    public List<MessageDTO> getChatMessages(String externalChatId, Long userId) {
        MessengerAccount account = getAccountOrThrow(userId);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Token", account.getAccessToken());
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<List> response = restTemplate.exchange(
                pythonServiceUrl + "/messages?channel_id=" + externalChatId + "&limit=50",
                HttpMethod.GET, entity, List.class);
        List<Map<String, Object>> rawMessages = response.getBody();

        return rawMessages.stream().map(raw -> {
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
    }

    public void sendMessage(Long userId, String channelId, String text) {
        MessengerAccount account = getAccountOrThrow(userId);

        Map<String, Object> request = new HashMap<>();
        request.put("token", account.getAccessToken());
        request.put("channel_id", channelId);
        request.put("text", text);

        restTemplate.postForEntity(pythonServiceUrl + "/send", request, Map.class);
        log.info("Slack message sent to channel: {}", channelId);
    }

    public MessengerAccount getSlackAccount(Long userId) {
        return messengerAccountRepository
                .findByUserIdAndMessengerType(userId, MessengerType.SLACK)
                .orElse(null);
    }

    private MessengerAccount getAccountOrThrow(Long userId) {
        return messengerAccountRepository
                .findByUserIdAndMessengerType(userId, MessengerType.SLACK)
                .orElseThrow(() -> new CustomException("Slack not connected", HttpStatus.NOT_FOUND));
    }

    @Transactional
    public void disconnect(Long userId) {
        messengerAccountRepository
                .findByUserIdAndMessengerType(userId, MessengerType.SLACK)
                .ifPresent(account -> {
                    account.setIsConnected(false);
                    account.setAccessToken(null);
                    messengerAccountRepository.save(account);
                });
        log.info("Slack disconnected for user: {}", userId);
    }

    public void syncChats(MessengerAccount account) {
        getUserChats(account.getUser().getId());
    }
}