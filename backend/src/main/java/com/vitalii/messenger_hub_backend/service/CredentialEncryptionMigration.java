package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.security.CryptoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Encrypts credentials stored before EncryptedStringConverter existed. Uses JDBC: re-saving through
 * JPA would not issue an UPDATE because the converter returns the same plain value to the entity.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CredentialEncryptionMigration implements ApplicationRunner {

    private static final String ENCRYPTED_PREFIX = "enc:v1:";

    private final JdbcTemplate jdbcTemplate;
    private final CryptoService cryptoService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, access_token, refresh_token FROM messenger_accounts " +
                            "WHERE (access_token IS NOT NULL AND access_token NOT LIKE ?) " +
                            "   OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE ?)",
                    ENCRYPTED_PREFIX + "%", ENCRYPTED_PREFIX + "%");

            if (rows.isEmpty()) return;

            int updated = 0;
            for (Map<String, Object> row : rows) {
                Long id = ((Number) row.get("id")).longValue();
                String accessToken = (String) row.get("access_token");
                String refreshToken = (String) row.get("refresh_token");

                updated += jdbcTemplate.update(
                        "UPDATE messenger_accounts SET access_token = ?, refresh_token = ? WHERE id = ?",
                        cryptoService.encrypt(accessToken),
                        cryptoService.encrypt(refreshToken),
                        id);
            }

            log.info("Encrypted credentials for {} messenger account(s) previously stored in clear text",
                    updated);
        } catch (Exception e) {
            log.error("Failed to encrypt legacy messenger credentials: {}", e.getMessage());
        }
    }
}
