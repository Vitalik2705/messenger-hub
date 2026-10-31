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
 * Client for the language model running locally in Ollama. Nothing is sent to the internet: the
 * archive holds other people's private messages.
 *
 * Ollama is a separate process the user starts and stops, so its failures are reported as readable
 * messages rather than exceptions.
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
     * Installed models that can generate text. Embedding models appear in the same list but have no
     * generate endpoint, so they are filtered out here.
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
     * Whether a model only produces embeddings, judged by name since Ollama does not report
     * capabilities.
     */
    /**
     * How long Ollama keeps a model loaded after a request (its default is 5 minutes), so the next
     * request does not reload gigabytes from disk.
     */
    private static final String KEEP_ALIVE = "30m";

    static boolean isEmbeddingOnly(String name) {
        String lower = name.toLowerCase();
        return lower.contains("embed") || lower.contains("minilm") || lower.startsWith("bge-");
    }

    /**
     * Embeds a batch of texts in one request. Falls back to the older one-text-per-call
     * `/api/embeddings` endpoint when `/api/embed` is missing.
     */
    public List<float[]> embed(String model, List<String> texts) {
        if (texts.isEmpty()) return List.of();
        try {
            Map<String, Object> request = Map.of("model", model, "input", texts, "keep_alive", KEEP_ALIVE);
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

    /** Models currently held in memory — a loaded model answers without a disk reload. */
    public List<String> loadedModels() {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(baseUrl + "/api/ps", String.class);
            List<String> names = new ArrayList<>();
            JSON.readTree(response.getBody()).path("models")
                    .forEach(model -> names.add(model.path("name").asText()));
            return names;
        } catch (Exception e) {
            return List.of();
        }
    }

    public String baseUrl() {
        return baseUrl;
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
     * Runs one prompt with `format: json`, which constrains decoding to valid JSON. Low
     * temperature, since this is extraction.
     */
    public Generation generateJson(String model, String system, String prompt) {
        return generateJson(model, system, prompt, null);
    }

    /** @param temperature null keeps the extraction default; reply drafting uses a little more. */
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
        request.put("keep_alive", KEEP_ALIVE);
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
