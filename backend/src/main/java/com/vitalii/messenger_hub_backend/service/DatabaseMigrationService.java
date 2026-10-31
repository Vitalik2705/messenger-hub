package com.vitalii.messenger_hub_backend.service;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Runs once at startup to apply schema migrations that Hibernate cannot handle
 * automatically (e.g., dropping a unique constraint, adding optional columns).
 *
 * Ordered after {@code entityManagerFactory} so that ddl-auto has already created any
 * missing tables — otherwise the very first run against an empty database would try to
 * alter tables that do not exist yet.
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
    }

    /**
     * What is on the other side of each chat — person, bot, channel, group, service.
     *
     * Left null for rows synced before the column existed; the next sync fills it in from
     * what the messenger reports, and everything reading it treats null as "not yet known"
     * rather than assuming a value.
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
     * Full-text search over the archived corpus.
     *
     * The column is GENERATED, so Postgres keeps it in step with every insert and update on
     * its own — nothing in the application has to remember to reindex. It stays unmapped in
     * {@code Message} for the same reason: a generated column cannot be written to.
     *
     * The 'simple' configuration is deliberate. Postgres ships no Ukrainian dictionary, and
     * picking 'english' would stem Latin words while mangling nothing else useful — worse
     * than no stemming at all on a corpus that mixes languages. Recall is recovered at query
     * time instead, by turning search terms into prefix matches.
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
