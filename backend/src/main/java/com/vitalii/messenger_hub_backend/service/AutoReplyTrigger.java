package com.vitalii.messenger_hub_backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns "a message arrived" into "consider replying", on a background thread.
 *
 * Separate from {@link AutoReplyService} so the transactional work stays reachable through
 * a proxy, and separate from archiving so a slow generation can never delay the archive or
 * the notification the user is actually waiting for.
 *
 * It shares the single-thread executor with analysis: both saturate the CPU, and running a
 * reply and an analysis at once would make each of them roughly twice as slow.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AutoReplyTrigger {

    private final AutoReplyService autoReplyService;

    @Async
    @TransactionalEventListener(fallbackExecution = true)
    public void onIncoming(MessageArchiveService.IncomingMessages event) {
        try {
            autoReplyService.considerReplying(event.chatId());
        } catch (Exception e) {
            // Never surfaced: a failed suggestion must not affect message delivery.
            log.warn("Auto-reply consideration failed for chat {}: {}", event.chatId(), e.getMessage());
        }
    }
}
