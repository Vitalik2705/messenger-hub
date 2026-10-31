package com.vitalii.messenger_hub_backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * The local model inside a conversation: "what did I miss?" for a pile of unread messages and reply
 * suggestions when the last word is not the user's. Both work from the messages the client sends,
 * and run only when asked.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AssistService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_MESSAGES = 60;
    private static final int MAX_CHARS = 500;

    private final OllamaClient ollama;

    @Value("${assist.model:qwen2.5:7b}")
    private String preferredModel;

    /** One line of the conversation as the client sends it. */
    public record Line(String sender, String text, boolean fromMe) {}

    private static final String CATCH_UP_SYSTEM = """
            Ти — помічник, який коротко переказує користувачу пропущене листування. Пиши українською.
            Рядки, що починаються з «Я:», написав сам користувач. Звертайся до нього на «ви»
            («вас просять…», «ви пообіцяли…»), не називай його «Я».
            Відповідай лише JSON такого вигляду:
            {"summary": "2–3 речення: про що говорили", "asks": ["конкретна дія, яку чекають від користувача"], "tone": "одне-два слова, наприклад «дружній» чи «діловий»"}
            Кожен пункт "asks" — коротка дія в наказовій формі, як у списку справ: «Переглянути договір до п'ятниці».
            Якщо від користувача нічого не чекають — "asks": [].
            Не вигадуй того, чого немає в повідомленнях.""";

    private static final String REPLIES_SYSTEM = """
            Ти пропонуєш варіанти відповіді від імені користувача на останнє повідомлення співрозмовника.
            Пиши українською, у тоні цього листування, кожен варіант до 15 слів.
            Дай три різні за змістом варіанти: погодитися або відповісти по суті, уточнити, відкласти.
            Нічого не обіцяй від імені користувача, чого він не міг би сказати сам.
            Відповідай лише JSON: {"replies": ["...", "...", "..."]}""";

    public Map<String, Object> catchUp(List<Line> lines) {
        String model = model();
        OllamaClient.Generation generation = ollama.generateJson(model, CATCH_UP_SYSTEM, transcript(lines), 0.2);
        JsonNode node = parse(generation.json());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", node.path("summary").asText(""));
        result.put("asks", strings(node.path("asks"), 4));
        result.put("tone", node.path("tone").asText(""));
        result.put("model", model);
        result.put("ms", generation.elapsedMs());
        return result;
    }

    public Map<String, Object> suggestReplies(List<Line> lines) {
        String model = model();
        OllamaClient.Generation generation = ollama.generateJson(model, REPLIES_SYSTEM, transcript(lines), 0.6);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("replies", strings(parse(generation.json()).path("replies"), 3));
        result.put("model", model);
        result.put("ms", generation.elapsedMs());
        return result;
    }

    /** The configured model if it is pulled, otherwise any language model that is. */
    private String model() {
        List<String> available = ollama.availableModels();
        if (available.isEmpty()) {
            throw new OllamaClient.OllamaUnavailableException(
                    "Локальна модель недоступна. Перевірте, чи запущено Ollama.");
        }
        return available.contains(preferredModel) ? preferredModel : available.get(0);
    }

    /** The tail of the conversation, oldest first, as "Name: text" lines. */
    static String transcript(List<Line> lines) {
        List<Line> tail = lines.size() > MAX_MESSAGES ? lines.subList(lines.size() - MAX_MESSAGES, lines.size()) : lines;
        StringBuilder sb = new StringBuilder();
        for (Line line : tail) {
            if (line.text() == null || line.text().isBlank()) continue;
            String text = line.text().length() > MAX_CHARS ? line.text().substring(0, MAX_CHARS) + "…" : line.text();
            sb.append(line.fromMe() ? "Я" : Objects.requireNonNullElse(line.sender(), "Співрозмовник"))
              .append(": ").append(text.replace('\n', ' ')).append('\n');
        }
        return sb.toString();
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json == null ? "{}" : json);
        } catch (Exception e) {
            log.debug("Assist output was not JSON: {}", e.getMessage());
            return JSON.createObjectNode();
        }
    }

    private static List<String> strings(JsonNode array, int limit) {
        List<String> out = new ArrayList<>();
        if (array.isArray()) {
            array.forEach(item -> {
                String text = item.asText("").trim();
                if (!text.isEmpty() && out.size() < limit) out.add(text);
            });
        }
        return out;
    }
}
