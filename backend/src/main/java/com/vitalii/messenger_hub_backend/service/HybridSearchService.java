package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.dto.MessageSearchResultDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Full-text and semantic search merged into one ranking with Reciprocal Rank Fusion (Cormack,
 * Clarke, Büttcher, SIGIR 2009): each list adds 1 / (k + rank) for every message it returned. RRF
 * uses ranks only, which matters because full-text ranks and cosine similarities are on unrelated
 * scales. A message both searches found rises above one found by either alone.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class HybridSearchService {

    /** The constant from the paper; it damps the advantage of the very top positions. */
    static final int RRF_K = 60;

    /** How deep each search is read before merging. */
    private static final int DEPTH = 30;

    private final MessageSearchService messageSearchService;
    private final SemanticSearchService semanticSearchService;

    public record Results(String query, List<MessageSearchResultDTO> results, String error) {}

    public Results search(Long userId, String query, String messengerType, int limit) {
        List<MessageSearchResultDTO> text = messageSearchService
                .search(userId, query, null, messengerType, DEPTH, 0).results();

        List<MessageSearchResultDTO> semantic = List.of();
        String error = null;
        try {
            semantic = semanticSearchService.search(userId, query, DEPTH).stream()
                    // Meaning search has no network filter of its own; applied here so both
                    // halves answer the same question.
                    .filter(hit -> messengerType == null || messengerType.equalsIgnoreCase(hit.getMessengerType()))
                    .toList();
        } catch (OllamaClient.OllamaUnavailableException e) {
            // Still a useful answer: the word half needs no model.
            error = "Пошук за змістом недоступний — показано лише збіги за словами. " + e.getMessage();
        }
        return new Results(query, fuse(text, semantic, limit), error);
    }

    /**
     * Reciprocal Rank Fusion of two ranked lists. When both hold a message, the full-text copy is
     * kept for its highlighted snippet.
     */
    static List<MessageSearchResultDTO> fuse(List<MessageSearchResultDTO> text,
                                             List<MessageSearchResultDTO> semantic, int limit) {
        Map<Long, Double> score = new HashMap<>();
        Map<Long, MessageSearchResultDTO> hit = new LinkedHashMap<>();
        Map<Long, Set<String>> sources = new HashMap<>();

        for (int i = 0; i < text.size(); i++) {
            MessageSearchResultDTO dto = text.get(i);
            score.merge(dto.getMessageId(), 1.0 / (RRF_K + i + 1), Double::sum);
            hit.putIfAbsent(dto.getMessageId(), dto);
            sources.computeIfAbsent(dto.getMessageId(), id -> new HashSet<>()).add("text");
        }
        for (int i = 0; i < semantic.size(); i++) {
            MessageSearchResultDTO dto = semantic.get(i);
            score.merge(dto.getMessageId(), 1.0 / (RRF_K + i + 1), Double::sum);
            hit.putIfAbsent(dto.getMessageId(), dto);
            sources.computeIfAbsent(dto.getMessageId(), id -> new HashSet<>()).add("semantic");
        }

        return hit.values().stream()
                .sorted(Comparator.comparingDouble((MessageSearchResultDTO dto) -> score.get(dto.getMessageId())).reversed())
                .limit(limit)
                .map(dto -> {
                    Set<String> from = sources.get(dto.getMessageId());
                    return MessageSearchResultDTO.builder()
                            .messageId(dto.getMessageId())
                            .chatId(dto.getChatId())
                            .chatName(dto.getChatName())
                            .messengerType(dto.getMessengerType())
                            .senderName(dto.getSenderName())
                            .isFromUser(dto.getIsFromUser())
                            .timestamp(dto.getTimestamp())
                            .text(dto.getText())
                            .snippet(dto.getSnippet())
                            .rank(score.get(dto.getMessageId()))
                            .matchedBy(from.size() == 2 ? "both" : from.iterator().next())
                            .build();
                })
                .toList();
    }
}
