package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.dto.MessageSearchResultDTO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.vitalii.messenger_hub_backend.service.HybridSearchService.fuse;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Reciprocal Rank Fusion, which decides the order of every hybrid result.
 */
class HybridFusionTest {

    private static MessageSearchResultDTO hit(long id, String snippet) {
        return MessageSearchResultDTO.builder().messageId(id).snippet(snippet).build();
    }

    private static List<Long> ids(List<MessageSearchResultDTO> results) {
        return results.stream().map(MessageSearchResultDTO::getMessageId).toList();
    }

    @Test
    void agreementBeatsOneSidedTopPlace() {
        // 3 is only second in each list, but both searches found it; 1 and 2 top one list each.
        var text = List.of(hit(1, null), hit(3, null));
        var semantic = List.of(hit(2, null), hit(3, null));

        var fused = fuse(text, semantic, 10);

        assertEquals(3L, fused.get(0).getMessageId(), "a message both searches found must rank first");
        assertEquals("both", fused.get(0).getMatchedBy());
        assertEquals(3, fused.size(), "a message in both lists appears once");
    }

    @Test
    void keepsTheHighlightedSnippetFromWordSearch() {
        var fused = fuse(List.of(hit(7, "«зустріч»")), List.of(hit(7, null)), 10);
        assertEquals("«зустріч»", fused.get(0).getSnippet());
    }

    @Test
    void marksWhereEachHitCameFromAndRespectsTheLimit() {
        var fused = fuse(List.of(hit(1, null), hit(2, null)), List.of(hit(3, null)), 2);

        assertEquals(2, fused.size());
        assertEquals(List.of(1L, 3L), ids(fused), "equal positions tie on score; word search was read first");
        assertEquals("text", fused.get(0).getMatchedBy());
        assertEquals("semantic", fused.get(1).getMatchedBy());
    }

    @Test
    void oneEmptySideLeavesTheOtherOrderUnchanged() {
        var fused = fuse(List.of(hit(5, null), hit(4, null), hit(9, null)), List.of(), 10);
        assertEquals(List.of(5L, 4L, 9L), ids(fused));
    }
}
