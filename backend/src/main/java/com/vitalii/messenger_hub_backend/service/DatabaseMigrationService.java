package com.vitalii.messenger_hub_backend.service;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Schema changes Hibernate's ddl-auto cannot make, applied once at startup after the entity manager
 * has created any missing tables.
 */
@Service
@DependsOn("entityManagerFactory")
@RequiredArgsConstructor
@Slf4j
public class DatabaseMigrationService {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void migrate() {
        dropUniqueConstraintIfExists();
        addAccountLabelColumnIfMissing();
        addChatKindColumnIfMissing();
        addMessageSearchIndexIfMissing();
        addChatLookupIndexesIfMissing();
        dropOversizedAvatars();
    }

    /**
     * Clears full-size avatars stored by older versions so the client refetches them at 160 px. A
     * no-op once they are gone.
     */
    private void dropOversizedAvatars() {
        try {
            int cleared = jdbcTemplate.update(
                "UPDATE chats SET avatar_base64 = NULL WHERE length(avatar_base64) > 40000");
            if (cleared > 0) log.info("DB migration: cleared {} full-size avatar(s) for re-fetch", cleared);
        } catch (Exception e) {
            log.warn("DB migration (oversized avatars) skipped: {}", e.getMessage());
        }
    }

    /**
     * Indexes for looking chats up by account and external id, which nearly every sync and archive
     * path does.
     */
    private void addChatLookupIndexesIfMissing() {
        try {
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_chats_account_external " +
                "ON chats (messenger_account_id, external_chat_id);"
            );
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_chats_user_external " +
                "ON chats (user_id, external_chat_id);"
            );
            log.info("DB migration: chat lookup indexes ensured");
        } catch (Exception e) {
            log.warn("DB migration (chat lookup indexes) skipped: {}", e.getMessage());
        }
    }

    /**
     * The kind of chat (person, bot, channel, group, service). Null for rows synced before the
     * column existed until the next sync fills it.
     */
    private void addChatKindColumnIfMissing() {
        try {
            jdbcTemplate.execute(
                "ALTER TABLE chats ADD COLUMN IF NOT EXISTS chat_kind VARCHAR(16);"
            );
            log.info("DB migration: chat_kind column ensured");
        } catch (Exception e) {
            log.warn("DB migration (chat_kind column) skipped: {}", e.getMessage());
        }
    }

    private void dropUniqueConstraintIfExists() {
        try {
            jdbcTemplate.execute(
                "DO $$ BEGIN " +
                "  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_user_messenger_type' " +
                "              AND conrelid = 'messenger_accounts'::regclass) THEN " +
                "    ALTER TABLE messenger_accounts DROP CONSTRAINT uk_user_messenger_type; " +
                "    RAISE NOTICE 'Dropped unique constraint uk_user_messenger_type'; " +
                "  END IF; " +
                "END $$;"
            );
            log.info("DB migration: unique constraint check completed (multiple accounts per network now allowed)");
        } catch (Exception e) {
            log.warn("DB migration (constraint drop) skipped: {}", e.getMessage());
        }
    }

    private void addAccountLabelColumnIfMissing() {
        try {
            jdbcTemplate.execute(
                "ALTER TABLE messenger_accounts ADD COLUMN IF NOT EXISTS account_label VARCHAR(255);"
            );
            log.info("DB migration: account_label column ensured");
        } catch (Exception e) {
            log.warn("DB migration (account_label column) skipped: {}", e.getMessage());
        }
    }

    /**
     * Full-text search column. GENERATED, so Postgres keeps it current; unmapped in Message because
     * it cannot be written.
     *
     * The 'simple' configuration: Postgres has no Ukrainian dictionary, and 'english' would only
     * stem Latin words. Recall is recovered at query time with prefix matching.
     */
    private void addMessageSearchIndexIfMissing() {
        try {
            jdbcTemplate.execute(
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector " +
                "GENERATED ALWAYS AS (" +
                "  to_tsvector('simple', coalesce(\"text\", '') || ' ' || coalesce(sender_name, ''))" +
                ") STORED;"
            );
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_messages_search " +
                "ON messages USING GIN (search_vector);"
            );
            log.info("DB migration: message search index ensured");
        } catch (Exception e) {
            log.warn("DB migration (message search index) skipped: {}", e.getMessage());
        }
    }
}
