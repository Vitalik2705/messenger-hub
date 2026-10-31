package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

/**
 * Sends text to a chat without the caller knowing which messenger it is.
 *
 * The five services grew their own send signatures — Telegram returns a map and takes a
 * reply id, the rest return nothing — which is fine where a controller already knows the
 * network it is talking to. Anything acting across all five needs one door, and this is it.
 */
@Service
@RequiredArgsConstructor
public class MessengerDispatch {

    // Lazy: these services are heavy graphs of their own, and nothing here is needed
    // until a message actually has to go out.
    @Lazy private final TelegramService telegramService;
    @Lazy private final SlackService slackService;
    @Lazy private final DiscordService discordService;
    @Lazy private final WhatsAppService whatsAppService;
    @Lazy private final ViberService viberService;

    public void send(Chat chat, Long userId, String text) {
        MessengerType type = chat.getMessengerAccount().getMessengerType();
        String externalChatId = chat.getExternalChatId();
        Long accountId = chat.getMessengerAccount().getId();

        switch (type) {
            case TELEGRAM -> telegramService.sendMessage(userId, externalChatId, text, null, accountId);
            case SLACK -> slackService.sendMessage(userId, externalChatId, text, accountId);
            case DISCORD -> discordService.sendMessage(userId, externalChatId, text, accountId);
            case WHATSAPP -> whatsAppService.sendMessage(userId, externalChatId, text, accountId);
            case VIBER -> viberService.sendMessage(userId, externalChatId, text, accountId);
        }
    }
}
