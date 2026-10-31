package com.vitalii.messenger_hub_backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.*;

/**
 * Talks to a language model running on the user's own machine.
 *
 * Nothing here reaches the internet, and that is the point rather than a side effect. This
 * archive holds private correspondence written by people who never agreed to have their
 * words sent anywhere; a hosted API would make that decision on their behalf. Local
 * inference is the only version of this feature that can be defended, and it happens to
 * also be the only free one.
 *
 * Ollama is treated as what it is — a separate process the user starts and stops. Every
 * failure mode here is ordinary rather than exceptional, so they are reported as messages a
 * person can act on instead of stack traces.
 */
@Service
@Slf4j
public class OllamaClient {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public OllamaClient(@Value("${ollama.url:http://localhost:11434}") String baseUrl,
                        @Value("${ollama.timeout-seconds:600}") long timeoutSeconds) {
        this.baseUrl = baseUrl;
        // Its own RestTemplate, not the shared bean: generating on a CPU takes minutes, and
        // the timeouts that suit a messenger API would abort every run.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));
        this.restTemplate = new RestTemplate(factory);
    }

    public record Generation(String json, long elapsedMs) {}

    /** Thrown for anything the user can fix: Ollama not running, model not pulled. */
    public static class OllamaUnavailableException extends RuntimeException {
        public OllamaUnavailableException(String message) { super(message); }
    }

    /**
     * The models on this machine that can actually answer a question.
     *
     * Embedding models are pulled for semantic search and show up in the same list, but they
     * have no generate endpoint at all: choosing one returns "does not support generate"
     * after the analysis has already run its metrics. They are filtered out here rather than
     * in the dialog, because the same list feeds every caller.
     */
    public List<String> availableModels() {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(baseUrl + "/api/tags", String.class);
            JsonNode models = JSON.readTree(response.getBody()).path("models");
            List<String> names = new ArrayList<>();
            models.forEach(model -> {
                String name = model.path("name").asText();
                if (!isEmbeddingOnly(name)) names.add(name);
            });
            return names;
        } catch (Exception e) {
            log.debug("Ollama not reachable at {}: {}", baseUrl, e.getMessage());
            return List.of();
        }
    }

    /**
     * Whether a model exists only to produce vectors.
     *
     * Matched by name because Ollama's tag listing does not say what a model can do. Every
     * embedding model published under the common registries carries one of these markers,
     * and a chat model carrying them would be a first.
     */
    static boolean isEmbeddingOnly(String name) {
        String lower = name.toLowerCase();
        return lower.contains("embed") || lower.contains("minilm") || lower.startsWith("bge-");
    }

    /**
     * Turns text into vectors, in one round trip for the whole batch.
     *
     * Batching matters more here than anywhere else: indexing an archive means tens of
     * thousands of short texts, and paying HTTP and model-load overhead per message would
     * turn minutes of work into hours.
     *
     * `/api/embed` is the current endpoint and takes a list; older builds only have
     * `/api/embeddings`, which takes one string at a time. The fallback is worth the few
     * lines because the alternative is the feature silently not working on a machine whose
     * Ollama is a version behind.
     */
    public List<float[]> embed(String model, List<String> texts) {
        if (texts.isEmpty()) return List.of();
        try {
            Map<String, Object> request = Map.of("model", model, "input", texts);
            ResponseEntity<String> response = restTemplate.postForEntity(
                    baseUrl + "/api/embed", new HttpEntity<>(request, jsonHeaders()), String.class);
            JsonNode embeddings = JSON.readTree(response.getBody()).path("embeddings");
            if (embeddings.isArray() && embeddings.size() == texts.size()) {
                List<float[]> vectors = new ArrayList<>(texts.size());
                embeddings.forEach(row -> vectors.add(toVector(row)));
                return vectors;
            }
            throw new OllamaUnavailableException("Несподівана відповідь /api/embed");
        } catch (HttpClientErrorException.NotFound notFound) {
            return embedOneByOne(model, texts);
        } catch (ResourceAccessException e) {
            throw new OllamaUnavailableException(
                    "Локальна модель недоступна за адресою " + baseUrl
                            + ". Перевірте, чи запущено Ollama.");
        } catch (OllamaUnavailableException e) {
            throw e;
        } catch (Exception e) {
            throw new OllamaUnavailableException("Помилка ембедингів: " + e.getMessage());
        }
    }

    private List<float[]> embedOneByOne(String model, List<String> texts) {
        List<float[]> vectors = new ArrayList<>(texts.size());
        for (String text : texts) {
            try {
                Map<String, Object> request = Map.of("model", model, "prompt", text);
                ResponseEntity<String> response = restTemplate.postForEntity(
                        baseUrl + "/api/embeddings", new HttpEntity<>(request, jsonHeaders()), String.class);
                vectors.add(toVector(JSON.readTree(response.getBody()).path("embedding")));
            } catch (HttpClientErrorException.NotFound e) {
                throw new OllamaUnavailableException(
                        "Модель «" + model + "» не завантажена. Виконайте: ollama pull " + model);
            } catch (Exception e) {
                throw new OllamaUnavailableException("Помилка ембедингів: " + e.getMessage());
            }
        }
        return vectors;
    }

    private static float[] toVector(JsonNode array) {
        float[] vector = new float[array.size()];
        for (int i = 0; i < vector.length; i++) vector[i] = (float) array.get(i).asDouble();
        return vector;
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    public boolean isReachable() {
        try {
            restTemplate.getForEntity(baseUrl + "/api/tags", String.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Runs one prompt and insists on JSON back.
     *
     * `format: json` makes Ollama constrain decoding to valid JSON, which removes the whole
     * class of failures where a small model wraps its answer in prose or a code fence.
     * Temperature is low because this is extraction, not writing.
     */
    public Generation generateJson(String model, String system, String prompt) {
        return generateJson(model, system, prompt, null);
    }

    /**
     * @param temperature how far the model may stray; null keeps the extraction default.
     *                    Writing in someone's voice wants a little more than extraction
     *                    does, which is why this is a setting rather than a constant.
     */
    public Generation generateJson(String model, String system, String prompt, Double temperature) {
        // Caught here rather than at the HTTP layer: a saved analysis profile can still name
        // an embedding model, and "does not support generate" says nothing to the user.
        if (isEmbeddingOnly(model)) {
            throw new OllamaUnavailableException(
                    "Модель «" + model + "» лише будує вектори й не вміє відповідати. "
                            + "Оберіть для аналізу мовну модель, наприклад qwen2.5.");
        }

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", model);
        request.put("system", system);
        request.put("prompt", prompt);
        request.put("stream", false);
        request.put("format", "json");
        request.put("options", Map.of(
                "temperature", temperature == null ? 0.2 : temperature,
                "num_ctx", 8192
        ));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        long started = System.currentTimeMillis();
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    baseUrl + "/api/generate", new HttpEntity<>(request, headers), String.class);
            JsonNode body = JSON.readTree(response.getBody());
            return new Generation(body.path("response").asText(), System.currentTimeMillis() - started);
        } catch (ResourceAccessException e) {
            throw new OllamaUnavailableException(
                    "Локальна модель недоступна за адресою " + baseUrl
                            + ". Перевірте, чи запущено Ollama.");
        } catch (HttpClientErrorException.NotFound e) {
            throw new OllamaUnavailableException(
                    "Модель «" + model + "» не завантажена. Виконайте: ollama pull " + model);
        } catch (Exception e) {
            throw new OllamaUnavailableException("Помилка локальної моделі: " + e.getMessage());
        }
    }
}
