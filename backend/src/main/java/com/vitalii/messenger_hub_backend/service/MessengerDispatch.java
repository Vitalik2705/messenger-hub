package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

/**
 * Sends text to a chat of any network through one method, for code that acts across all of them.
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
