package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.AnalysisRun;
import com.vitalii.messenger_hub_backend.model.entity.Chat;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.model.enums.AnalysisMetric;
import com.vitalii.messenger_hub_backend.repository.AnalysisPromptRepository;
import com.vitalii.messenger_hub_backend.repository.AnalysisRunRepository;
import com.vitalii.messenger_hub_backend.repository.ChatRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Pins down how a model comparison is queued.
 *
 * The grouping is the whole feature: two runs that do not share an id are two unrelated
 * analyses, and the page has nothing to put side by side. The fallbacks matter just as
 * much — asking to compare a model with itself is a request for one run, not two.
 */
class ChatAnalysisComparisonTest {

    private final AnalysisRunRepository runRepository = mock(AnalysisRunRepository.class);
    private final AnalysisPromptRepository promptRepository = mock(AnalysisPromptRepository.class);
    private final ChatRepository chatRepository = mock(ChatRepository.class);
    private final UserService userService = mock(UserService.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);

    private final ChatAnalysisService service = new ChatAnalysisService(
            runRepository, promptRepository, chatRepository, userService, events);

    private static final Set<AnalysisMetric> METRICS = EnumSet.of(AnalysisMetric.VOLUME);

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setId(7L);
        user.setEmail("v@example.com");

        Chat chat = new Chat();
        chat.setId(42L);
        chat.setUser(user);
        chat.setName("Норберт");

        when(userService.findByEmail("v@example.com")).thenReturn(user);
        when(chatRepository.findById(42L)).thenReturn(Optional.of(chat));
        when(promptRepository.findByUserIdAndIdIn(anyLong(), any())).thenReturn(List.of());

        // Ids are assigned by the database; the service only needs them back to publish.
        AtomicLong ids = new AtomicLong(1);
        when(runRepository.save(any(AnalysisRun.class))).thenAnswer(invocation -> {
            AnalysisRun run = invocation.getArgument(0);
            if (run.getId() == null) run.setId(ids.getAndIncrement());
            return run;
        });
    }

    private List<AnalysisRun> request(List<String> models) {
        return service.requestComparison("v@example.com", 42L, METRICS, models, 200, true, List.of());
    }

    @Test
    void groupsBothRunsUnderOneComparisonId() {
        List<AnalysisRun> runs = request(List.of("qwen2.5:7b", "qwen2.5:3b"));

        assertEquals(2, runs.size());
        assertNotNull(runs.get(0).getComparisonId());
        assertEquals(runs.get(0).getComparisonId(), runs.get(1).getComparisonId(),
                "both halves of a comparison must share an id, or nothing pairs them up");
    }

    /** Everything but the model is held identical — that is what makes it a comparison. */
    @Test
    void keepsEverythingButTheModelIdentical() {
        List<AnalysisRun> runs = request(List.of("qwen2.5:7b", "qwen2.5:3b"));

        assertEquals("qwen2.5:7b", runs.get(0).getModel());
        assertEquals("qwen2.5:3b", runs.get(1).getModel());
        assertEquals(runs.get(0).getChat().getId(), runs.get(1).getChat().getId());
        assertEquals(runs.get(0).getMetrics(), runs.get(1).getMetrics());
        assertEquals(runs.get(0).getMessageLimit(), runs.get(1).getMessageLimit());
    }

    /** A lone model is an ordinary run, and must not be marked as half of a pair. */
    @Test
    void doesNotGroupASingleModel() {
        List<AnalysisRun> runs = request(List.of("qwen2.5:7b"));

        assertEquals(1, runs.size());
        assertNull(runs.get(0).getComparisonId());
    }

    /** Comparing a model with itself would run the same thing twice and prove nothing. */
    @Test
    void collapsesDuplicateModels() {
        List<AnalysisRun> runs = request(List.of("qwen2.5:7b", "qwen2.5:7b"));

        assertEquals(1, runs.size());
        assertNull(runs.get(0).getComparisonId());
    }

    /** Blanks arrive from an unset dropdown and must not become a second run. */
    @Test
    void ignoresBlankModels() {
        List<AnalysisRun> runs = request(java.util.Arrays.asList("qwen2.5:7b", "", null));

        assertEquals(1, runs.size());
        assertEquals("qwen2.5:7b", runs.get(0).getModel());
    }

    /** Every queued run has to be announced, or the worker never picks it up. */
    @Test
    void announcesEveryQueuedRun() {
        request(List.of("qwen2.5:7b", "qwen2.5:3b"));
        verify(events, times(2)).publishEvent(any(ChatAnalysisService.AnalysisRequested.class));
    }
}
