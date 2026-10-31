package com.vitalii.messenger_hub_backend.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * What the model is shown for "what did I miss" and reply suggestions.
 */
class AssistTranscriptTest {

    @Test
    void namesTheUserAsMeAndSkipsEmptyLines() {
        String text = AssistService.transcript(List.of(
                new AssistService.Line("Олег", "Привіт, коли зустрінемось?", false),
                new AssistService.Line(null, "  ", false),
                new AssistService.Line("Віталій", "Завтра о 10", true)));

        assertEquals("Олег: Привіт, коли зустрінемось?\nЯ: Завтра о 10\n", text);
    }

    @Test
    void keepsOnlyTheTailOfALongConversation() {
        List<AssistService.Line> lines = new ArrayList<>();
        for (int i = 0; i < 100; i++) lines.add(new AssistService.Line("A", "m" + i, false));

        String text = AssistService.transcript(lines);

        assertFalse(text.contains("A: m39\n"), "older messages beyond the window are dropped");
        assertTrue(text.startsWith("A: m40\n"));
        assertTrue(text.endsWith("A: m99\n"), "the newest message is always included");
    }

    @Test
    void flattensLineBreaksSoEachMessageIsOneLine() {
        String text = AssistService.transcript(List.of(new AssistService.Line("A", "раз\nдва", false)));
        assertEquals("A: раз два\n", text);
    }
}
