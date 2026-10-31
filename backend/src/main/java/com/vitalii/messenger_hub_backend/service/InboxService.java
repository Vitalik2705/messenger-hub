package com.vitalii.messenger_hub_backend.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Person chats from the last two weeks whose latest message is not the user's, across all networks.
 * One query on the archive, no model; questions are listed first.
 */
@Service
@RequiredArgsConstructor
public class InboxService {

    private static final int DAYS = 14;
    private static final int LIMIT = 8;
    private static final Pattern QUESTION = Pattern.compile(
            "\\?|(^|\\s)(коли|чи|де|як|що|чому|навіщо|скільки|хто|який|яка|яке|можеш|можете|підкажи|підкажіть)(\\s|$)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private final JdbcTemplate jdbcTemplate;

    public List<Map<String, Object>> unanswered(Long userId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT * FROM (
                    SELECT DISTINCT ON (m.chat_id)
                           m.chat_id, coalesce(m.text, m.transcript) AS text, m.timestamp,
                           m.is_from_user, m.sender_name,
                           c.name AS chat_name, c.external_chat_id, c.messenger_account_id,
                           a.messenger_type
                    FROM messages m
                    JOIN chats c ON c.id = m.chat_id
                    JOIN messenger_accounts a ON a.id = c.messenger_account_id
                    WHERE c.user_id = ?
                      AND (c.chat_kind = 'PERSON' OR (c.chat_kind IS NULL AND c.chat_type = 'PERSONAL'))
                      AND m.timestamp > now() - make_interval(days => ?)
                    ORDER BY m.chat_id, m.timestamp DESC
                ) latest
                WHERE is_from_user = false AND text IS NOT NULL AND length(text) > 0
                ORDER BY timestamp DESC
                LIMIT 40
                """, userId, DAYS);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String text = (String) row.get("text");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("chatId", row.get("chat_id"));
            item.put("externalChatId", row.get("external_chat_id"));
            item.put("messengerAccountId", row.get("messenger_account_id"));
            item.put("messengerType", row.get("messenger_type"));
            item.put("chatName", row.get("chat_name"));
            item.put("senderName", row.get("sender_name"));
            item.put("text", text.length() > 200 ? text.substring(0, 200) + "…" : text);
            item.put("timestamp", ((Timestamp) row.get("timestamp")).toLocalDateTime());
            item.put("question", QUESTION.matcher(text).find());
            out.add(item);
        }
        // Questions first; within each group the newest first (the query order is kept).
        out.sort(Comparator.comparing((Map<String, Object> item) -> !(Boolean) item.get("question")));
        return out.size() > LIMIT ? out.subList(0, LIMIT) : out;
    }
}
