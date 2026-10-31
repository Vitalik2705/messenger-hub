package com.vitalii.messenger_hub_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vitalii.messenger_hub_backend.model.entity.Message;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Does the analysis, off the request thread.
 *
 * Arithmetic first, model second. The order is the design: metrics are exact and cost
 * nothing, so they always run; the model is slow, fallible and optional, so it runs last
 * and its failure never destroys the half that already succeeded.
 *
 * Deliberately not transactional. A generation call holds this thread for tens of seconds
 * and a transaction spanning it would pin a database connection for the duration; every
 * database step is a short call back into {@link ChatAnalysisService} instead.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AnalysisRunner {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("dd.MM HH:mm");

    /**
     * What the model is asked to produce.
     *
     * Every claim must carry a quotation. Small models confabulate fluently, and the only
     * practical defence is to make the output checkable: a claim the user can trace back to
     * a real message is a claim they can reject.
     */
    private static final String SUMMARY_SYSTEM = """
            Ти аналізуєш приватне листування і відповідаєш ВИКЛЮЧНО валідним JSON.
            Пиши українською. Не вигадуй фактів: якщо чогось немає в повідомленнях —
            залишай поле порожнім або порожнім списком.

            Структура відповіді:
            {
              "summary": "2-4 речення про те, про що це листування",
              "topics": ["коротка тема", "..."],
              "tone": "один-два слова про загальний тон",
              "agreements": [{"what": "домовленість або обіцянка", "quote": "дослівна цитата"}],
              "openQuestions": [{"what": "питання без відповіді", "quote": "дослівна цитата"}]
            }
            Поле quote має бути дослівним фрагментом одного з наведених повідомлень.
            """;

    private final ChatAnalysisService analysisService;
    private final BatchAnalysisService batchService;
    private final DigestService digestService;
    private final ChatMetricsService metricsService;
    private final MessageRepository messageRepository;
    private final OllamaClient ollama;

    /**
     * Starts once the queued run is committed.
     *
     * AFTER_COMMIT rather than a direct call: the worker thread queries for a row the
     * request thread has only just inserted, and without the commit boundary it would
     * regularly find nothing.
     */
    @Async
    @TransactionalEventListener
    public void onRequested(ChatAnalysisService.AnalysisRequested event) {
        run(event.runId());
    }

    /**
     * Runs a whole sweep, on the same single thread as everything else.
     *
     * Sharing the executor is deliberate: a batch queues model runs of its own, and letting
     * the scan and those runs compete for the CPU would make both slower than running them
     * in order.
     */
    @Async
    @TransactionalEventListener(fallbackExecution = true)
    public void onBatchRequested(BatchAnalysisService.BatchRequested event) {
        batchService.execute(event.batchId());
    }

    /** The digest, on the same queue as everything else that competes for the CPU. */
    @Async
    @TransactionalEventListener(fallbackExecution = true)
    public void onDigestRequested(DigestService.DigestRequested event) {
        digestService.execute(event.digestId());
    }

    public void run(Long runId) {
        try {
            ChatAnalysisService.RunPlan plan = analysisService.begin(runId);
            if (plan == null) return;

            ChatMetricsService.Metrics computed =
                    metricsService.compute(plan.chatId(), plan.metrics());
            String metricsJson = ChatAnalysisService.writeJson(computed.values());

            String insightsJson = null;
            String customJson = null;
            String error = null;
            Long modelMs = null;

            if (plan.model() != null) {
                try {
                    List<Message> transcript = recentMessages(plan.chatId(), plan.messageLimit());
                    if (transcript.isEmpty()) {
                        error = "В архіві ще немає повідомлень цього чату — моделі нема що читати.";
                    } else {
                        String conversation = buildPrompt(plan.chatName(), transcript);
                        long spent = 0;

                        if (plan.includeSummary()) {
                            OllamaClient.Generation generation =
                                    ollama.generateJson(plan.model(), SUMMARY_SYSTEM, conversation);
                            insightsJson = generation.json();
                            spent += generation.elapsedMs();
                        }

                        if (!plan.prompts().isEmpty()) {
                            List<Map<String, Object>> answers = new ArrayList<>();
                            for (ChatAnalysisService.PromptSpec spec : plan.prompts()) {
                                answers.add(ask(plan.model(), conversation, spec));
                            }
                            for (Map<String, Object> answer : answers) {
                                Object ms = answer.get("ms");
                                if (ms instanceof Long value) spent += value;
                            }
                            customJson = ChatAnalysisService.writeJson(answers);
                        }

                        modelMs = spent;
                        log.info("Analysis {} on {}: {} messages, {} question(s) in {} ms",
                                runId, plan.model(), transcript.size(),
                                plan.prompts().size() + (plan.includeSummary() ? 1 : 0), spent);
                    }
                } catch (OllamaClient.OllamaUnavailableException e) {
                    // Expected rather than exceptional — Ollama is a process the user owns.
                    error = e.getMessage();
                }
            }

            analysisService.finish(runId, metricsJson, insightsJson, customJson, error, modelMs,
                    computed.messageCount());
        } catch (Exception e) {
            log.warn("Analysis run {} failed: {}", runId, e.getMessage(), e);
            analysisService.fail(runId, "Аналіз не вдався: " + e.getMessage());
        }
    }

    /**
     * The frame every user-written question is asked inside.
     *
     * The user supplies the question; this supplies the discipline. Left to itself a 7B
     * model answers a free-form question with fluent paragraphs that cite nothing, which is
     * exactly the output that cannot be checked and therefore cannot be trusted.
     */
    private static final String CUSTOM_SYSTEM = """
            Ти аналізуєш приватне листування і відповідаєш ВИКЛЮЧНО валідним JSON.
            Пиши українською. Відповідай тільки на поставлене питання.
            Не вигадуй: якщо в повідомленнях немає підстав для відповіді —
            так і напиши в полі answer, а quotes залиш порожнім.

            Структура відповіді:
            {
              "answer": "відповідь на питання, 1-5 речень",
              "quotes": ["дослівні цитати з повідомлень, що підтверджують відповідь"]
            }
            """;

    /**
     * One question, one call.
     *
     * Asking several questions in a single generation makes a small model blur them
     * together — it answers the first properly and lets the rest decay into paraphrase.
     * Separate calls cost more wall-clock time and are the reason each one is timed
     * individually, so the price of a question is visible rather than buried in a total.
     */
    private Map<String, Object> ask(String model, String conversation,
                                    ChatAnalysisService.PromptSpec spec) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", spec.name());
        // The question is stored with its answer: rewording the prompt later must not
        // silently change what an old result appears to have been asked.
        result.put("prompt", spec.prompt());
        try {
            OllamaClient.Generation generation = ollama.generateJson(
                    model, CUSTOM_SYSTEM, conversation + "\n\nПитання: " + spec.prompt());
            result.put("result", parseOrRaw(generation.json()));
            result.put("ms", generation.elapsedMs());
        } catch (OllamaClient.OllamaUnavailableException e) {
            // One failed question does not cancel the others, nor the metrics.
            result.put("error", e.getMessage());
        }
        return result;
    }

    private Object parseOrRaw(String json) {
        try {
            return JSON.readValue(json, Object.class);
        } catch (Exception e) {
            return Map.of("answer", json == null ? "" : json);
        }
    }

    private List<Message> recentMessages(Long chatId, int limit) {
        List<Message> messages = new ArrayList<>(
                messageRepository.findByChatIdOrderByTimestampDesc(chatId, PageRequest.of(0, limit)));
        Collections.reverse(messages);
        return messages;
    }

    /**
     * The transcript, plainly labelled.
     *
     * Speakers are "Я" and the chat's own name rather than raw ids: that is what the model
     * has to reason about, and what the user will read the returned quotations against.
     */
    private String buildPrompt(String chatName, List<Message> messages) {
        String counterpart = chatName == null || chatName.isBlank() ? "Співрозмовник" : chatName;
        StringBuilder prompt = new StringBuilder();
        prompt.append("Листування з «").append(counterpart).append("». Останні ")
                .append(messages.size()).append(" повідомлень:\n\n");

        for (Message message : messages) {
            String text = message.getText();
            if (text == null || text.isBlank()) continue;
            prompt.append('[')
                    .append(message.getTimestamp() == null ? "?" : STAMP.format(message.getTimestamp()))
                    .append("] ")
                    .append(Boolean.TRUE.equals(message.getIsFromUser()) ? "Я" : counterpart)
                    .append(": ")
                    // Long messages are clipped rather than dropped: the context window is
                    // finite and one essay must not crowd out fifty exchanges.
                    .append(text.length() > 500 ? text.substring(0, 500) + "…" : text)
                    .append('\n');
        }
        return prompt.toString();
    }
}
