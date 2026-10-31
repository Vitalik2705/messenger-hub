package com.vitalii.messenger_hub_backend.model.enums;

import org.junit.jupiter.api.Test;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Pins down what "most interesting" means for each ranking.
 *
 * A batch spends real minutes of inference on whatever lands at the top of this list, so a
 * ranking that sorts the wrong way does not merely mislabel a table — it points the model
 * at the wrong three chats out of fifty.
 */
class BatchRankingTest {

    /** A HashMap, not Map.of: the null cases below are the point, and Map.of rejects nulls. */
    private static Map<String, Object> group(String name, String key, Object value) {
        Map<String, Object> inner = new java.util.HashMap<>();
        inner.put(key, value);
        Map<String, Object> outer = new java.util.HashMap<>();
        outer.put(name, inner);
        return outer;
    }

    @Test
    void readsTheFigureEachRankingIsAbout() {
        assertEquals(48.0, BatchRanking.UNANSWERED.score(group("debt", "hoursWaiting", 48.0)));
        assertEquals(900.0, BatchRanking.MY_RESPONSE.score(group("responseTime", "myMedianSeconds", 900L)));
        assertEquals(120.0, BatchRanking.VOLUME.score(group("volume", "total", 120)));
        assertEquals(0.31, BatchRanking.NIGHT.score(group("rhythm", "nightShare", 0.31)));
    }

    /**
     * A shrinking exchange has a negative slope, and "fading fastest" has to sort it first —
     * so the score is the negated slope, not the slope.
     */
    @Test
    void rankingFadingPutsTheSteepestDeclineOnTop() {
        Double shrinking = BatchRanking.FADING.score(group("trend", "messagesPerWeekSlope", -4.2));
        Double growing = BatchRanking.FADING.score(group("trend", "messagesPerWeekSlope", 3.1));

        assertNotNull(shrinking);
        assertNotNull(growing);
        assertTrue(shrinking > growing, "a fading chat must outrank a growing one");
    }

    /**
     * Null is "this chat cannot answer the question", not "zero".
     *
     * A chat the user has already replied to has no hours-waiting; scoring it 0 would drop
     * it to the bottom, which is right by accident — but a chat with too few replies to have
     * a median would also score 0 and outrank a chat that genuinely answers in a minute.
     */
    @Test
    void scoresNullWhenTheChatCannotAnswerTheQuestion() {
        assertNull(BatchRanking.UNANSWERED.score(group("debt", "hoursWaiting", null)));
        assertNull(BatchRanking.MY_RESPONSE.score(group("responseTime", "myMedianSeconds", null)));
        assertNull(BatchRanking.FADING.score(group("trend", "messagesPerWeekSlope", null)));
    }

    /** A metric that was never requested must not crash the sweep. */
    @Test
    void scoresNullWhenTheMetricIsAbsentEntirely() {
        assertNull(BatchRanking.UNANSWERED.score(Map.of()));
        assertNull(BatchRanking.VOLUME.score(group("responseTime", "myMedianSeconds", 5L)));
    }

    /** The whole point: sorting by score descending puts the longest wait first. */
    @Test
    void sortsTheDebtListLongestWaitFirst() {
        record Row(String name, Double score) {}
        List<Row> rows = new java.util.ArrayList<>(List.of(
                new Row("щойно", BatchRanking.UNANSWERED.score(group("debt", "hoursWaiting", 2.0))),
                new Row("три дні", BatchRanking.UNANSWERED.score(group("debt", "hoursWaiting", 72.0))),
                new Row("вчора", BatchRanking.UNANSWERED.score(group("debt", "hoursWaiting", 20.0)))));

        rows.sort(Comparator.comparing(Row::score, Comparator.reverseOrder()));
        assertEquals(List.of("три дні", "вчора", "щойно"), rows.stream().map(Row::name).toList());
    }
}
