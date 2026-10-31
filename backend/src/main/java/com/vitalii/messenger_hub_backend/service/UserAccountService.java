package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.repository.MessengerAccountRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The settings page's view of the user's stored data, and deletion of all of it. The foreign keys
 * have no ON DELETE CASCADE, so every table is cleared explicitly, children first.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserAccountService {

    private final JdbcTemplate jdbc;
    private final MessengerAccountRepository messengerAccountRepository;
    private final TelegramService telegramService;
    private final WhatsAppService whatsAppService;
    private final SlackService slackService;
    private final DiscordService discordService;
    private final ViberService viberService;

    public Map<String, Object> overview(User user) {
        Long id = user.getId();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("accounts", jdbc.queryForList("""
                SELECT id, messenger_type AS "messengerType", COALESCE(account_label, username) AS label,
                       is_connected AS connected, last_sync_at AS "lastSyncAt"
                FROM messenger_accounts WHERE user_id = ? ORDER BY created_at""", id));
        result.put("chats", count("SELECT count(*) FROM chats WHERE user_id = ?", id));
        result.put("messages", count("""
                SELECT count(*) FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.user_id = ?""", id));
        result.put("indexed", count("SELECT count(*) FROM message_embeddings WHERE user_id = ?", id));
        result.put("analyses", count("SELECT count(*) FROM analysis_runs WHERE user_id = ?", id)
                + count("SELECT count(*) FROM digests WHERE user_id = ?", id));
        result.put("contacts", count("SELECT count(*) FROM contacts WHERE user_id = ?", id));
        return result;
    }

    /**
     * Sessions first, then rows. Each messenger service disconnects its own session (WhatsApp drops
     * its browser session); a failure there is logged and the deletion continues.
     */
    @Transactional
    public void deleteEverything(User user) {
        Long id = user.getId();
        for (MessengerAccount account : messengerAccountRepository.findByUserId(id)) {
            try {
                switch (account.getMessengerType()) {
                    case TELEGRAM -> telegramService.disconnect(id, account.getId());
                    case WHATSAPP -> whatsAppService.disconnect(id, account.getId());
                    case SLACK -> slackService.disconnect(id, account.getId());
                    case DISCORD -> discordService.disconnect(id, account.getId());
                    case VIBER -> viberService.disconnect(id, account.getId());
                }
            } catch (Exception e) {
                log.warn("Could not disconnect account {} before deletion: {}", account.getId(), e.getMessage());
            }
        }

        // Vectors are large objects: the row holds only their oid, so each is unlinked too.
        jdbc.queryForList("SELECT lo_unlink(vector) FROM message_embeddings WHERE user_id = ?", id);
        // Children before parents, in the order the foreign keys demand.
        for (String sql : List.of(
                "DELETE FROM message_embeddings WHERE user_id = ?",
                "DELETE FROM contact_link_suggestions WHERE user_id = ?",
                "DELETE FROM contact_identities WHERE user_id = ?",
                "DELETE FROM contacts WHERE user_id = ?",
                "DELETE FROM reply_drafts WHERE user_id = ?",
                "DELETE FROM analysis_runs WHERE user_id = ?",
                "DELETE FROM analysis_batches WHERE user_id = ?",
                "DELETE FROM analysis_prompts WHERE user_id = ?",
                "DELETE FROM digests WHERE user_id = ?",
                "DELETE FROM auto_reply_settings WHERE user_id = ?",
                "DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)",
                "DELETE FROM chats WHERE user_id = ?",
                "DELETE FROM messenger_accounts WHERE user_id = ?",
                "DELETE FROM users WHERE id = ?")) {
            jdbc.update(sql, id);
        }
        log.info("Account deleted with all its data: id={}", id);
    }

    private long count(String sql, Long id) {
        Long n = jdbc.queryForObject(sql, Long.class, id);
        return n == null ? 0 : n;
    }
}
