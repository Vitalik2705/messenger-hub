package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.Message;
import com.vitalii.messenger_hub_backend.model.enums.AnalysisMetric;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Pins down the arithmetic the analysis rests on.
 *
 * These numbers end up in a report a person reads and acts on, so the cases that matter are
 * the ones where a plausible-looking implementation would quietly lie: counting a monologue
 * as fast replies, calling five messages a habit, or reporting a trend from two weeks.
 */
class ChatMetricsServiceTest {

    private final MessageRepository repository = mock(MessageRepository.class);
    private final ChatMetricsService service = new ChatMetricsService(repository);

    private static final LocalDateTime START = LocalDateTime.of(2026, 3, 2, 10, 0);

    /** The repository hands back newest-first; the service has to reverse it itself. */
    private void given(List<Message> oldestFirst) {
        List<Message> newestFirst = new ArrayList<>(oldestFirst);
        Collections.reverse(newestFirst);
        when(repository.findByChatIdOrderByTimestampDesc(anyLong())).thenReturn(newestFirst);
    }

    private Message message(boolean mine, LocalDateTime at, String text) {
        Message m = new Message();
        m.setIsFromUser(mine);
        m.setTimestamp(at);
        m.setText(text);
        return m;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> metric(String key, AnalysisMetric requested) {
        return (Map<String, Object>) service.compute(1L, EnumSet.of(requested)).values().get(key);
    }

    @Test
    void countsWhoSaidHowMuch() {
        given(List.of(
                message(true, START, "раз"),
                message(true, START.plusMinutes(1), "два"),
                message(false, START.plusMinutes(2), "три")));

        Map<String, Object> volume = metric("volume", AnalysisMetric.VOLUME);
        assertEquals(3, volume.get("total"));
        assertEquals(2L, volume.get("mine"));
        assertEquals(1L, volume.get("theirs"));
        assertEquals(0.67, volume.get("myShare"));
    }

    /**
     * A run of messages from one side is one person still talking. Counting each of them as
     * a reply is the mistake that makes every chat look instantaneous.
     */
    @Test
    void onlyCountsAReplyWhenTheSpeakerChanges() {
        List<Message> messages = new ArrayList<>();
        LocalDateTime at = START;
        // Ten turns, each answered a minute later — plus filler from the same side that must
        // not be counted at all.
        for (int i = 0; i < 10; i++) {
            messages.add(message(false, at, "питання"));
            messages.add(message(false, at.plusSeconds(5), "ще думка"));
            messages.add(message(true, at.plusMinutes(1), "відповідь"));
            at = at.plusHours(1);
        }
        given(messages);

        Map<String, Object> response = metric("responseTime", AnalysisMetric.RESPONSE_TIME);
        assertEquals(10, response.get("myRepliesCounted"));
        // 55 s, not 5 s: my reply is measured from their last message, and their own
        // follow-up is not a reply to themselves.
        assertEquals(55L, response.get("myMedianSeconds"));
    }

    /** A median over a handful of replies is noise; it must be withheld, not rounded. */
    @Test
    void withholdsMediansDrawnFromTooFewReplies() {
        given(List.of(
                message(false, START, "привіт"),
                message(true, START.plusMinutes(2), "привіт")));

        Map<String, Object> response = metric("responseTime", AnalysisMetric.RESPONSE_TIME);
        assertEquals(1, response.get("myRepliesCounted"));
        assertNull(response.get("myMedianSeconds"));
    }

    /** A reply two days later is someone getting back to you, not a turn in a conversation. */
    @Test
    void ignoresRepliesBeyondTheCutoff() {
        List<Message> messages = new ArrayList<>();
        LocalDateTime at = START;
        for (int i = 0; i < 6; i++) {
            messages.add(message(false, at, "?"));
            messages.add(message(true, at.plusDays(3), "вибач, загубив"));
            at = at.plusDays(10);
        }
        given(messages);

        Map<String, Object> response = metric("responseTime", AnalysisMetric.RESPONSE_TIME);
        assertEquals(0, response.get("myRepliesCounted"));
    }

    /** A new conversation starts after a long silence, not at every message. */
    @Test
    void attributesEachConversationToWhoeverBrokeTheSilence() {
        given(List.of(
                message(true, START, "перша розмова"),
                message(false, START.plusMinutes(3), "відповідь"),
                // Same day, well within the gap — still the same conversation.
                message(false, START.plusHours(2), "ще одне"),
                // Next day: a new conversation, opened by them.
                message(false, START.plusDays(1), "друга розмова"),
                message(true, START.plusDays(1).plusMinutes(5), "ага")));

        Map<String, Object> initiative = metric("initiative", AnalysisMetric.INITIATIVE);
        assertEquals(2L, initiative.get("conversations"));
        assertEquals(1L, initiative.get("startedByMe"));
        assertEquals(1L, initiative.get("startedByThem"));
        // Two conversations is not a habit, so the share stays unreported.
        assertNull(initiative.get("myShare"));
    }

    /** Volume without spread flatters a two-day burst; activeDayShare is the corrective. */
    @Test
    void separatesHowLongFromHowOften() {
        List<Message> messages = new ArrayList<>();
        for (int i = 0; i < 50; i++) messages.add(message(true, START.plusMinutes(i), "."));
        messages.add(message(true, START.plusDays(99), "через три місяці"));
        given(messages);

        Map<String, Object> span = metric("span", AnalysisMetric.SPAN);
        assertEquals(100L, span.get("calendarDays"));
        assertEquals(2L, span.get("activeDays"));
        assertEquals(0.02, span.get("activeDayShare"));
    }

    /** Under four weeks a single busy week would set the direction on its own. */
    @Test
    void withholdsATrendUntilThereAreEnoughWeeks() {
        List<Message> messages = new ArrayList<>();
        for (int week = 0; week < 3; week++) {
            messages.add(message(true, START.plusWeeks(week), "."));
        }
        given(messages);

        assertNull(metric("trend", AnalysisMetric.TREND).get("messagesPerWeekSlope"));
    }

    /** With enough weeks, a fading exchange has to read as negative. */
    @Test
    void reportsAFadingExchangeAsANegativeSlope() {
        List<Message> messages = new ArrayList<>();
        int[] perWeek = {10, 8, 5, 3, 1};
        for (int week = 0; week < perWeek.length; week++) {
            for (int i = 0; i < perWeek[week]; i++) {
                messages.add(message(true, START.plusWeeks(week).plusMinutes(i), "."));
            }
        }
        given(messages);

        Object slope = metric("trend", AnalysisMetric.TREND).get("messagesPerWeekSlope");
        assertNotNull(slope);
        assertTrue((Double) slope < 0, "a shrinking exchange must slope downwards, got " + slope);
    }

    /** An empty archive reports nothing rather than zeros that look like findings. */
    @Test
    void saysNothingAboutAnEmptyChat() {
        given(List.of());
        ChatMetricsService.Metrics metrics = service.compute(1L, EnumSet.allOf(AnalysisMetric.class));
        assertEquals(0, metrics.messageCount());
        assertTrue(metrics.values().isEmpty());
    }
}
