package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.dto.MessageSearchResultDTO;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Full-text search over the archive of every connected messenger at once. */
@Service
@RequiredArgsConstructor
@Slf4j
public class MessageSearchService {

    /** Beyond this, extra terms narrow nothing and only cost planning time. */
    private static final int MAX_TERMS = 10;
    private static final int MAX_TERM_LENGTH = 50;
    private static final int MAX_LIMIT = 50;
    private static final int DEFAULT_LIMIT = 20;

    private final MessageRepository messageRepository;

    public record SearchResults(String query, long total, int limit, int offset,
                                List<MessageSearchResultDTO> results) {

        static SearchResults empty(String query, int limit, int offset) {
            return new SearchResults(query, 0, limit, offset, List.of());
        }
    }

    @Transactional(readOnly = true)
    public SearchResults search(Long userId, String query, Long chatId, String messengerType,
                                Integer limit, Integer offset) {
        int effectiveLimit = clamp(limit == null ? DEFAULT_LIMIT : limit, 1, MAX_LIMIT);
        int effectiveOffset = Math.max(0, offset == null ? 0 : offset);

        String tsquery = toTsQuery(query);
        if (tsquery == null) {
            // Nothing searchable was typed — punctuation only, or an empty box.
            return SearchResults.empty(query, effectiveLimit, effectiveOffset);
        }

        String type = (messengerType == null || messengerType.isBlank())
                ? null : messengerType.trim().toUpperCase();

        try {
            long total = messageRepository.countSearchHits(userId, tsquery, chatId, type);
            if (total == 0) {
                return new SearchResults(query, 0, effectiveLimit, effectiveOffset, List.of());
            }

            List<Object[]> rows = messageRepository.search(
                    userId, tsquery, chatId, type, effectiveLimit, effectiveOffset);

            List<MessageSearchResultDTO> results = new ArrayList<>(rows.size());
            for (Object[] row : rows) {
                results.add(toDto(row));
            }
            return new SearchResults(query, total, effectiveLimit, effectiveOffset, results);
        } catch (Exception e) {
            // The likeliest cause is a database that has not picked up the search column yet.
            // An empty result set degrades the feature; a 500 would break the page around it.
            log.warn("Search failed for user {} (query '{}'): {}", userId, query, e.getMessage());
            return SearchResults.empty(query, effectiveLimit, effectiveOffset);
        }
    }

    private MessageSearchResultDTO toDto(Object[] row) {
        return MessageSearchResultDTO.builder()
                .messageId(asLong(row[0]))
                .chatId(asLong(row[1]))
                .chatName(asString(row[2]))
                .messengerType(asString(row[3]))
                .senderName(asString(row[4]))
                .isFromUser(row[5] != null && (Boolean) row[5])
                .timestamp(asDateTime(row[6]))
                .text(asString(row[7]))
                .snippet(asString(row[8]))
                .rank(row[9] == null ? 0.0 : ((Number) row[9]).doubleValue())
                .build();
    }

    /**
     * Turns user input into a tsquery. Every term becomes a prefix match, which recovers most
     * inflected forms without a Ukrainian stemmer ("зустріч" finds "зустрічі") and works while
     * typing. Terms are reduced to letters and digits, so input cannot change the query structure
     * or make to_tsquery fail.
     *
     * @return a tsquery expression, or null if nothing searchable remained
     */
    static String toTsQuery(String raw) {
        if (raw == null || raw.isBlank()) return null;

        List<String> terms = new ArrayList<>();
        StringBuilder current = new StringBuilder();

        for (int i = 0; i < raw.length() && terms.size() < MAX_TERMS; i++) {
            char c = raw.charAt(i);
            if (Character.isLetterOrDigit(c)) {
                if (current.length() < MAX_TERM_LENGTH) current.append(c);
            } else if (current.length() > 0) {
                terms.add(current.toString());
                current.setLength(0);
            }
        }
        if (current.length() > 0 && terms.size() < MAX_TERMS) terms.add(current.toString());

        if (terms.isEmpty()) return null;

        return String.join(" & ", terms.stream().map(t -> t + ":*").toList());
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static Long asLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }

    private static LocalDateTime asDateTime(Object value) {
        if (value == null) return null;
        if (value instanceof LocalDateTime dateTime) return dateTime;
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime();
        return null;
    }
}
