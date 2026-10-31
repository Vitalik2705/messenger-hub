package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import com.vitalii.messenger_hub_backend.repository.MessengerAccountRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

import java.net.InetAddress;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;

/**
 * One snapshot of the whole system: microservices, local models, archive and background jobs. Shows
 * at a glance before a demo what is down, and where the model actually runs, judged from the
 * backend's own configuration.
 */
@Service
@Slf4j
public class SystemStatusService {

    private final RestTemplate probe;
    private final OllamaClient ollama;
    private final SemanticSearchService semanticSearch;
    private final TranscriptionService transcription;
    private final BackgroundWorkGate gate;
    private final MessageRepository messageRepository;
    private final MessengerAccountRepository accountRepository;
    private final JdbcTemplate jdbcTemplate;
    private final Map<String, String[]> services;

    public SystemStatusService(OllamaClient ollama,
                               SemanticSearchService semanticSearch,
                               TranscriptionService transcription,
                               BackgroundWorkGate gate,
                               MessageRepository messageRepository,
                               MessengerAccountRepository accountRepository,
                               JdbcTemplate jdbcTemplate,
                               @Value("${telegram.python.service.url:http://localhost:8201}") String telegramUrl,
                               @Value("${slack.python.service.url:http://localhost:8202}") String slackUrl,
                               @Value("${discord.python.service.url:http://localhost:8203}") String discordUrl,
                               @Value("${whatsapp.node.service.url:http://localhost:8204}") String whatsappUrl,
                               @Value("${viber.python.service.url:http://localhost:8205}") String viberUrl,
                               @Value("${whisper.url:http://localhost:8206}") String whisperUrl) {
        this.ollama = ollama;
        this.semanticSearch = semanticSearch;
        this.transcription = transcription;
        this.gate = gate;
        this.messageRepository = messageRepository;
        this.accountRepository = accountRepository;
        this.jdbcTemplate = jdbcTemplate;

        // Short: a status panel that hangs on the one service that is down is no status panel.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        this.probe = new RestTemplate(factory);

        // key → {display name, role, base url}
        Map<String, String[]> map = new LinkedHashMap<>();
        map.put("telegram", new String[]{"Telegram", "Python · Telethon (MTProto)", telegramUrl});
        map.put("whatsapp", new String[]{"WhatsApp", "Node.js · whatsapp-web.js", whatsappUrl});
        map.put("slack", new String[]{"Slack", "Python · Slack Web API", slackUrl});
        map.put("discord", new String[]{"Discord", "Python · Discord API", discordUrl});
        map.put("viber", new String[]{"Viber", "Python · Viber Bot API", viberUrl});
        map.put("whisper", new String[]{"Whisper", "Python · faster-whisper", whisperUrl});
        this.services = map;
    }

    public Map<String, Object> status(Long userId) {
        long started = System.currentTimeMillis();

        // Every probe at once: the slowest one sets the time, not their sum.
        Map<String, CompletableFuture<Map<String, Object>>> probes = new LinkedHashMap<>();
        services.forEach((key, info) -> probes.put(key,
                CompletableFuture.supplyAsync(() -> probeService(key, info))));
        CompletableFuture<Map<String, Object>> ai = CompletableFuture.supplyAsync(() -> aiStatus(userId));

        List<Map<String, Object>> serviceRows = new ArrayList<>();
        serviceRows.add(databaseRow());
        probes.values().forEach(future -> serviceRows.add(future.join()));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("checkedAt", Instant.now().toString());
        result.put("services", serviceRows);
        result.put("ai", ai.join());
        result.put("data", dataStatus(userId));
        result.put("accounts", accounts(userId));
        result.put("background", background());
        result.put("tookMs", System.currentTimeMillis() - started);
        return result;
    }

    private Map<String, Object> probeService(String key, String[] info) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", key);
        row.put("name", info[0]);
        row.put("role", info[1]);
        row.put("url", info[2]);
        long t = System.currentTimeMillis();
        try {
            ResponseEntity<String> response = probe.getForEntity(
                    info[2] + ("whisper".equals(key) ? "/health" : "/"), String.class);
            row.put("up", true);
            if ("whisper".equals(key) && response.getBody() != null) {
                row.put("detail", response.getBody().contains("\"loaded\":true")
                        ? "модель у пам'яті" : "модель завантажується");
            }
        } catch (RestClientResponseException e) {
            // 404 on "/" is an answer: the process is up and serving HTTP.
            row.put("up", true);
        } catch (Exception e) {
            row.put("up", false);
            row.put("detail", "не відповідає");
        }
        row.put("latencyMs", System.currentTimeMillis() - t);
        return row;
    }

    private Map<String, Object> databaseRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", "postgres");
        row.put("name", "PostgreSQL");
        row.put("role", "Архів, повнотекстовий індекс, вектори");
        long t = System.currentTimeMillis();
        try {
            String version = jdbcTemplate.queryForObject("SHOW server_version", String.class);
            row.put("up", true);
            row.put("detail", "версія " + version);
        } catch (Exception e) {
            row.put("up", false);
            row.put("detail", "недоступна");
        }
        row.put("latencyMs", System.currentTimeMillis() - t);
        return row;
    }

    private Map<String, Object> aiStatus(Long userId) {
        Map<String, Object> ai = new LinkedHashMap<>();
        String url = ollama.baseUrl();
        ai.put("ollamaUrl", url);
        ai.put("local", isLocalHost(url));
        List<String> models = ollama.availableModels();
        ai.put("reachable", !models.isEmpty() || ollama.isReachable());
        ai.put("models", models);
        ai.put("loaded", ollama.loadedModels());

        SemanticSearchService.Status search = semanticSearch.status(userId);
        ai.put("embeddingModel", search.model());

        TranscriptionService.Status voice = transcription.status(userId);
        ai.put("whisperModel", voice.model());
        ai.put("whisperUp", voice.available());
        return ai;
    }

    private Map<String, Object> dataStatus(Long userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        SemanticSearchService.Status search = semanticSearch.status(userId);
        TranscriptionService.Status voice = transcription.status(userId);
        data.put("messages", messageRepository.countByUserId(userId));
        data.put("chatsWithMessages", messageRepository.countChatsWithMessages(userId));
        data.put("embedded", search.indexed());
        data.put("pendingEmbeddings", search.pending());
        data.put("voiceMessages", voice.voiceMessages());
        data.put("transcribed", voice.transcribed());
        return data;
    }

    private List<Map<String, Object>> accounts(Long userId) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MessengerAccount account : accountRepository.findByUserId(userId)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("messengerType", account.getMessengerType().name());
            String label = account.getAccountLabel() != null ? account.getAccountLabel() : account.getUsername();
            row.put("label", label);
            row.put("connected", Boolean.TRUE.equals(account.getIsConnected()));
            rows.add(row);
        }
        return rows;
    }

    private Map<String, Object> background() {
        Map<String, Object> bg = new LinkedHashMap<>();
        bg.put("running", gate.runningJob());
        bg.put("userActive", gate.userIsActive());
        Map<String, String> lastRuns = new LinkedHashMap<>();
        gate.lastRuns().forEach((name, millis) -> lastRuns.put(name, Instant.ofEpochMilli(millis).toString()));
        bg.put("lastRuns", lastRuns);
        return bg;
    }

    /**
     * Whether the model host is this machine or a container beside it, judged by what the address
     * resolves to.
     */
    static boolean isLocalHost(String url) {
        try {
            String host = URI.create(url).getHost();
            if (host == null) return false;
            if (host.equals("localhost") || host.equals("host.docker.internal") || host.equals("ollama")) {
                return true;
            }
            InetAddress address = InetAddress.getByName(host);
            return address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress();
        } catch (Exception e) {
            return false;
        }
    }
}
