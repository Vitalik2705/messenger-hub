package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.Message;
import com.vitalii.messenger_hub_backend.model.enums.AnalysisMetric;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Conversation metrics computed without a model: arithmetic over timestamps and lengths, exact and
 * cheap enough to run on every chat. They pick which chats the model reads. Derived figures come
 * with their sample sizes, and thin samples are left null.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChatMetricsService {

    private final MessageRepository messageRepository;

    /**
     * A gap after which the next message starts a new conversation. Six hours spans a night without
     * swallowing a working day.
     */
    private static final Duration CONVERSATION_GAP = Duration.ofHours(6);

    /** Replies slower than this are someone getting back to you, not a reply in a thread. */
    private static final Duration REPLY_CUTOFF = Duration.ofHours(24);

    /** Below this, a median says more about luck than about habit. */
    private static final int MIN_SAMPLE = 5;

    public record Metrics(Map<String, Object> values, int messageCount) {}

    /** Computes the requested metrics for one chat from the local archive. */
    @Transactional(readOnly = true)
    public Metrics compute(Long chatId, Set<AnalysisMetric> requested) {
        List<Message> messages = new ArrayList<>(messageRepository.findByChatIdOrderByTimestampDesc(chatId));
        // Oldest first: every calculation below reads the conversation forwards.
        Collections.reverse(messages);
        messages.removeIf(m -> m.getTimestamp() == null);

        Map<String, Object> values = new LinkedHashMap<>();
        if (messages.isEmpty()) return new Metrics(values, 0);

        for (AnalysisMetric metric : requested) {
            switch (metric) {
                case VOLUME -> values.put("volume", volume(messages));
                case INITIATIVE -> values.put("initiative", initiative(messages));
                case RESPONSE_TIME -> values.put("responseTime", responseTime(messages));
                case RHYTHM -> values.put("rhythm", rhythm(messages));
                case STYLE -> values.put("style", style(messages));
                case SPAN -> values.put("span", span(messages));
                case TREND -> values.put("trend", trend(messages));
                case DEBT -> values.put("debt", debt(messages));
            }
        }
        return new Metrics(values, messages.size());
    }

    // ── Individual metrics ────────────────────────────────────────────────────

    private Map<String, Object> volume(List<Message> messages) {
        long mine = messages.stream().filter(this::fromUser).count();
        long theirs = messages.size() - mine;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", messages.size());
        result.put("mine", mine);
        result.put("theirs", theirs);
        // Share rather than a ratio: a ratio divides by zero the moment one side is silent.
        result.put("myShare", round(messages.isEmpty() ? 0 : (double) mine / messages.size()));
        return result;
    }

    private Map<String, Object> initiative(List<Message> messages) {
        long mine = 0;
        long theirs = 0;
        for (int i = 0; i < messages.size(); i++) {
            boolean opensConversation = i == 0 || Duration.between(
                    messages.get(i - 1).getTimestamp(), messages.get(i).getTimestamp())
                    .compareTo(CONVERSATION_GAP) > 0;
            if (!opensConversation) continue;
            if (fromUser(messages.get(i))) mine++;
            else theirs++;
        }
        long total = mine + theirs;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("conversations", total);
        result.put("startedByMe", mine);
        result.put("startedByThem", theirs);
        result.put("myShare", total < MIN_SAMPLE ? null : round((double) mine / total));
        return result;
    }

    private Map<String, Object> responseTime(List<Message> messages) {
        List<Long> mine = new ArrayList<>();
        List<Long> theirs = new ArrayList<>();

        for (int i = 1; i < messages.size(); i++) {
            Message previous = messages.get(i - 1);
            Message current = messages.get(i);
            // Only a turn counts: consecutive messages from the same side are one person
            // still talking, and counting them would report a "response time" of seconds.
            if (fromUser(previous) == fromUser(current)) continue;

            long seconds = Duration.between(previous.getTimestamp(), current.getTimestamp()).toSeconds();
            if (seconds < 0 || seconds > REPLY_CUTOFF.toSeconds()) continue;
            (fromUser(current) ? mine : theirs).add(seconds);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("myRepliesCounted", mine.size());
        result.put("theirRepliesCounted", theirs.size());
        result.put("myMedianSeconds", median(mine));
        result.put("theirMedianSeconds", median(theirs));
        return result;
    }

    private Map<String, Object> rhythm(List<Message> messages) {
        int[] byHour = new int[24];
        int[] byWeekday = new int[7];
        long atNight = 0;

        for (Message message : messages) {
            LocalDateTime at = message.getTimestamp();
            byHour[at.getHour()]++;
            byWeekday[at.getDayOfWeek().getValue() - 1]++;
            if (at.getHour() >= 23 || at.getHour() < 6) atNight++;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("byHour", byHour);
        result.put("byWeekday", byWeekday);
        result.put("nightShare", round((double) atNight / messages.size()));
        result.put("busiestHour", indexOfMax(byHour));
        return result;
    }

    private Map<String, Object> style(List<Message> messages) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("myAvgChars", avgChars(messages, true));
        result.put("theirAvgChars", avgChars(messages, false));
        result.put("myQuestionShare", questionShare(messages, true));
        result.put("theirQuestionShare", questionShare(messages, false));
        return result;
    }

    private Map<String, Object> span(List<Message> messages) {
        LocalDateTime first = messages.get(0).getTimestamp();
        LocalDateTime last = messages.get(messages.size() - 1).getTimestamp();
        long activeDays = messages.stream().map(m -> m.getTimestamp().toLocalDate()).distinct().count();
        long calendarDays = Math.max(1, ChronoUnit.DAYS.between(first.toLocalDate(), last.toLocalDate()) + 1);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("firstMessageAt", first.toString());
        result.put("lastMessageAt", last.toString());
        result.put("calendarDays", calendarDays);
        result.put("activeDays", activeDays);
        // How often the conversation is alive at all, which reads very differently from
        // a raw message count: 400 messages across two days is not a relationship.
        result.put("activeDayShare", round((double) activeDays / calendarDays));
        return result;
    }

    private Map<String, Object> trend(List<Message> messages) {
        LocalDateTime first = messages.get(0).getTimestamp();
        Map<Long, Integer> perWeek = new TreeMap<>();
        for (Message message : messages) {
            long week = ChronoUnit.WEEKS.between(first, message.getTimestamp());
            perWeek.merge(week, 1, Integer::sum);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("weeks", perWeek.size());
        result.put("perWeek", perWeek);

        // A least-squares slope over weekly counts: positive means the exchange is picking
        // up, negative means it is fading. Withheld under four weeks, where a single busy
        // week would set the direction on its own.
        if (perWeek.size() >= 4) {
            double meanX = perWeek.keySet().stream().mapToLong(Long::longValue).average().orElse(0);
            double meanY = perWeek.values().stream().mapToInt(Integer::intValue).average().orElse(0);
            double covariance = 0;
            double variance = 0;
            for (Map.Entry<Long, Integer> week : perWeek.entrySet()) {
                double dx = week.getKey() - meanX;
                covariance += dx * (week.getValue() - meanY);
                variance += dx * dx;
            }
            result.put("messagesPerWeekSlope", variance == 0 ? null : round(covariance / variance));
        } else {
            result.put("messagesPerWeekSlope", null);
        }
        return result;
    }

    /**
     * Whether the last word was the other side's, and how long ago — from the archive, since a chat
     * can be read and still unanswered.
     */
    private Map<String, Object> debt(List<Message> messages) {
        Message last = messages.get(messages.size() - 1);
        boolean waiting = !fromUser(last);
        double hours = Duration.between(last.getTimestamp(), LocalDateTime.now()).toMinutes() / 60.0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("waiting", waiting);
        result.put("lastFrom", fromUser(last) ? "me" : "them");
        result.put("lastMessageAt", last.getTimestamp().toString());
        // Null when the ball is in their court: "0 hours waiting" would rank a chat the
        // user has already answered alongside one they answered a second ago.
        result.put("hoursWaiting", waiting ? round(hours) : null);
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean fromUser(Message message) {
        return Boolean.TRUE.equals(message.getIsFromUser());
    }

    private Double avgChars(List<Message> messages, boolean mine) {
        return messages.stream()
                .filter(m -> fromUser(m) == mine)
                .filter(m -> m.getText() != null)
                .mapToInt(m -> m.getText().length())
                .average().stream().boxed().map(this::round).findFirst().orElse(null);
    }

    private Double questionShare(List<Message> messages, boolean mine) {
        List<Message> side = messages.stream()
                .filter(m -> fromUser(m) == mine)
                .filter(m -> m.getText() != null && !m.getText().isBlank())
                .toList();
        if (side.size() < MIN_SAMPLE) return null;
        long questions = side.stream().filter(m -> m.getText().contains("?")).count();
        return round((double) questions / side.size());
    }

    private Long median(List<Long> values) {
        if (values.size() < MIN_SAMPLE) return null;
        List<Long> sorted = values.stream().sorted().toList();
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 1
                ? sorted.get(middle)
                : (sorted.get(middle - 1) + sorted.get(middle)) / 2;
    }

    private int indexOfMax(int[] counts) {
        int best = 0;
        for (int i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
        return best;
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
