package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import com.vitalii.messenger_hub_backend.repository.MessengerAccountRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class TelegramPollingService {

    private final MessengerAccountRepository messengerAccountRepository;
    private final TelegramService telegramService;

    /**
     * Keeps chat rows (unread counts, last activity) current while nobody has the dashboard open.
     * Once a minute: each tick fetches the dialog list of every account.
     */
    @Scheduled(fixedDelayString = "${telegram.sync.interval-ms:60000}",
            initialDelayString = "${telegram.sync.initial-delay-ms:30000}")
    public void pollTelegramUpdates() {
        try {
            List<MessengerAccount> accounts = messengerAccountRepository
                    .findAllByMessengerTypeAndIsConnected(MessengerType.TELEGRAM, true);

            for (MessengerAccount account : accounts) {
                try {
                    telegramService.syncChats(account);
                } catch (Exception e) {
                    log.error("Failed to sync chats for account {}: {}",
                            account.getUsername(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Failed to poll Telegram updates: {}", e.getMessage());
        }
    }
}