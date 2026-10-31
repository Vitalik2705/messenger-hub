package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import com.vitalii.messenger_hub_backend.repository.ChatRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Pulls chat history in the background so the local archive grows on its own.
 *
 * Without this, messages are only archived for chats the user happens to open, since
 * that is the only time the frontend asks for them. Fetching a chat's messages archives
 * them as a side effect, so this service only has to decide *which* chats to refresh.
 *
 * Work is deliberately slow: a small batch per tick, oldest-refreshed first, with a pause
 * between chats. Messenger APIs rate-limit aggressively and a Telegram account that trips
 * a limit is far more expensive than a slow archive.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MessageBackfillService {

    private final ChatRepository chatRepository;
    private final TelegramService telegramService;
    private final SlackService slackService;
    private final DiscordService discordService;
    private final WhatsAppService whatsAppService;
    private final ViberService viberService;
    private final BackgroundWorkGate gate;

    @Value("${archive.backfill.enabled:true}")
    private boolean enabled;

    /** How many chats to refresh per tick. */
    @Value("${archive.backfill.batch-size:10}")
    private int batchSize;

    /** Leave a chat alone for this long after it was last refreshed. */
    @Value("${archive.backfill.min-age-minutes:60}")
    private long minAgeMinutes;

    /** Pause between chats, to stay well under messenger rate limits. */
    @Value("${archive.backfill.pause-ms:1000}")
    private long pauseMs;

    /** Messages requested per chat. */
    @Value("${archive.backfill.messages-per-chat:50}")
    private int messagesPerChat;

    @Scheduled(fixedDelayString = "${archive.backfill.interval-ms:300000}",
            initialDelayString = "${archive.backfill.initial-delay-ms:60000}")
    public void backfill() {
        if (!enabled) return;
        // The archiver pulls history through the very connection the open chat is waiting
        // on, so it waits its turn like the rest.
        gate.runIfIdle("backfill", this::runBackfill);
    }

    private void runBackfill() {
        if (!enabled) return;

        List<Object[]> targets = chatRepository.findChatsDueForArchiving(
                LocalDateTime.now().minusMinutes(minAgeMinutes),
                PageRequest.of(0, batchSize));
        if (targets.isEmpty()) return;

        int succeeded = 0;
        for (Object[] target : targets) {
            Long chatId = (Long) target[0];
            String externalChatId = (String) target[1];
            Long accountId = (Long) target[2];
            Long userId = (Long) target[3];
            MessengerType type = (MessengerType) target[4];

            try {
                fetchHistory(type, externalChatId, userId, accountId);
                succeeded++;
            } catch (Exception e) {
                log.warn("Backfill failed for {} chat {} (account {}): {}",
                        type, externalChatId, accountId, e.getMessage());
            } finally {
                // Mark it either way, so one permanently broken chat cannot stall the rotation.
                chatRepository.markArchived(chatId, LocalDateTime.now());
            }

            if (pauseMs > 0) {
                try {
                    Thread.sleep(pauseMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.info("Backfill interrupted; stopping this run");
                    return;
                }
            }
        }
        log.info("Backfill pass finished: {}/{} chat(s) refreshed", succeeded, targets.size());
    }

    /**
     * Fetching messages is what triggers archiving inside each messenger service,
     * so the return value is intentionally unused.
     */
    private void fetchHistory(MessengerType type, String externalChatId, Long userId, Long accountId) {
        switch (type) {
            case TELEGRAM -> telegramService.getChatMessages(
                    externalChatId, userId, messagesPerChat, 0, 0, accountId);
            case SLACK -> slackService.getChatMessages(externalChatId, userId, accountId);
            case DISCORD -> discordService.getChatMessages(externalChatId, userId, accountId);
            case WHATSAPP -> whatsAppService.getChatMessages(externalChatId, userId, accountId);
            case VIBER -> viberService.getChatMessages(externalChatId, userId, accountId);
        }
    }
}
