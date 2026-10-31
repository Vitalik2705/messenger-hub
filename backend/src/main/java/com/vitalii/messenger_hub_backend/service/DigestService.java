package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.entity.Digest;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.model.enums.AnalysisStatus;
import com.vitalii.messenger_hub_backend.model.enums.DigestScope;
import com.vitalii.messenger_hub_backend.repository.DigestRepository;
import com.vitalii.messenger_hub_backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * "While you were away" — across every network at once.
 *
 * The counting is the digest. Which chats received something, how much, and whether the
 * last word is still theirs are facts, they cost one query, and they already answer the
 * question. The model is asked only what counting cannot say: what those messages were
 * about — and only for the few chats that got the most.
 *
 * The same cascade as everywhere else, for the same reason: on this hardware a summary per
 * chat would take an hour, and nobody reads fifty summaries anyway.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DigestService {

    /** Ceiling on chats the model summarises, whatever the request asks for. */
    public static final int MAX_TOP_N = 8;

    /**
     * Asked per chat, about that chat's new messages only.
     *
     * Deliberately narrow. A model given the whole day across every network writes a
     * paragraph that is true of nothing in particular; given one chat's twelve new messages
     * it writes something the user can act on.
     */
    private static final String SYSTEM = """
            Ти стисло переказуєш нові повідомлення з одного чату.
            Відповідай ВИКЛЮЧНО валідним JSON: {"summary": "1-2 речення", "needsReply": true|false}
            Пиши українською. Не вигадуй нічого, чого немає в повідомленнях.
            needsReply — true, якщо там є пряме питання або прохання до користувача.
            """;

    private final DigestRepository digestRepository;
    private final MessageRepository messageRepository;
    private final OllamaClient ollama;
    private final UserService userService;
    private final ApplicationEventPublisher events;

    public record DigestRequested(Long digestId) {}

    @Transactional
    public Digest request(String email, Integer hoursBack, String model, Integer topN, String scope) {
        User user = userService.findByEmail(email);
        int hours = hoursBack == null ? 24 : Math.max(1, Math.min(hoursBack, 24 * 14));
        LocalDateTime to = LocalDateTime.now();

        Digest digest = digestRepository.save(Digest.builder()
                .user(user)
                .status(AnalysisStatus.PENDING)
                .fromAt(to.minusHours(hours))
                .toAt(to)
                .scope(DigestScope.parse(scope))
                .model(model == null || model.isBlank() ? null : model)
                .modelTopN(model == null || model.isBlank() ? 0
                        : Math.max(0, Math.min(topN == null ? 3 : topN, MAX_TOP_N)))
                .build());

        events.publishEvent(new DigestRequested(digest.getId()));
        return digest;
    }

    /**
     * Builds the digest: count everything, then read the top few.
     *
     * Not transactional as a whole — the model calls in the middle would hold a connection
     * for minutes. Each database step is its own short transaction.
     */
    public void execute(Long digestId) {
        Digest digest = begin(digestId);
        if (digest == null) return;

        try {
            Long userId = digest.getUser().getId();
            LocalDateTime since = digest.getFromAt();
            DigestScope scope = digest.getScope() == null ? DigestScope.PEOPLE : digest.getScope();

            List<Object[]> rows = messageRepository.findIncomingSince(userId, since, scope.kindNames());
            List<Map<String, Object>> items = new ArrayList<>();
            int totalMessages = 0;

            for (Object[] row : rows) {
                Long chatId = ((Number) row[0]).longValue();
                int incoming = ((Number) row[3]).intValue();
                totalMessages += incoming;

                Map<String, Object> item = new LinkedHashMap<>();
                item.put("chatId", chatId);
                item.put("chatName", row[1]);
                item.put("messengerType", String.valueOf(row[2]));
                item.put("incoming", incoming);
                item.put("lastAt", String.valueOf(row[4]));
                item.put("chatKind", row[5] == null ? null : String.valueOf(row[5]));
                // The single most actionable fact in the whole digest, and it is free.
                item.put("unanswered", !Boolean.TRUE.equals(messageRepository.lastMessageIsFromUser(chatId)));
                items.add(item);
            }

            long spent = 0;
            String error = null;
            int topN = digest.getModelTopN() == null ? 0 : digest.getModelTopN();

            if (topN > 0 && digest.getModel() != null) {
                try {
                    int done = 0;
                    for (Map<String, Object> item : items) {
                        if (done >= topN) break;
                        // Channels broadcast; a summary of what a news feed posted is not
                        // news the user missed, and it would use the whole budget.
                        if ("CHANNEL".equals(item.get("chatKind"))) continue;

                        List<String> texts = messageRepository.findIncomingTextsSince(
                                ((Number) item.get("chatId")).longValue(), since);
                        if (texts.isEmpty()) continue;

                        OllamaClient.Generation generation = ollama.generateJson(
                                digest.getModel(), SYSTEM, buildPrompt(item, texts));
                        item.put("summary", generation.json());
                        spent += generation.elapsedMs();
                        done++;
                    }
                } catch (OllamaClient.OllamaUnavailableException e) {
                    // The counted half stands on its own; the summaries are the extra.
                    error = e.getMessage();
                }
            }

            finish(digestId, ChatAnalysisService.writeJson(items), items.size(),
                    totalMessages, spent, error);
            log.info("Digest {} ({}): {} chat(s), {} incoming message(s)",
                    digestId, scope, items.size(), totalMessages);
        } catch (Exception e) {
            log.warn("Digest {} failed: {}", digestId, e.getMessage(), e);
            finish(digestId, null, 0, 0, 0, "Дайджест не вдався: " + e.getMessage());
        }
    }

    private String buildPrompt(Map<String, Object> item, List<String> texts) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Нові повідомлення з чату «").append(item.get("chatName")).append("»:\n\n");
        for (String text : texts) {
            prompt.append("- ").append(text.length() > 300 ? text.substring(0, 300) + "…" : text).append('\n');
        }
        return prompt.toString();
    }

    // ── Persistence steps ─────────────────────────────────────────────────────

    @Transactional
    public Digest begin(Long digestId) {
        Digest digest = digestRepository.findById(digestId).orElse(null);
        if (digest == null) return null;
        digest.setStatus(AnalysisStatus.RUNNING);
        digestRepository.save(digest);
        digest.getUser().getId(); // touch while the session is open
        return digest;
    }

    @Transactional
    public void finish(Long digestId, String itemsJson, int chats, int messages,
                       long modelMs, String error) {
        digestRepository.findById(digestId).ifPresent(digest -> {
            digest.setItemsJson(itemsJson);
            digest.setChatsTouched(chats);
            digest.setMessagesReceived(messages);
            digest.setModelMs(modelMs == 0 ? null : modelMs);
            digest.setError(error);
            digest.setFinishedAt(LocalDateTime.now());
            digest.setStatus(itemsJson == null ? AnalysisStatus.FAILED : AnalysisStatus.DONE);
            digestRepository.save(digest);
        });
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<Digest> history(String email) {
        return digestRepository.findTop30ByUserIdOrderByCreatedAtDesc(
                userService.findByEmail(email).getId());
    }

    @Transactional
    public void delete(String email, Long digestId) {
        Long userId = userService.findByEmail(email).getId();
        Digest digest = digestRepository.findById(digestId)
                .orElseThrow(() -> new CustomException("Дайджест не знайдено", HttpStatus.NOT_FOUND));
        if (!digest.getUser().getId().equals(userId)) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }
        digestRepository.delete(digest);
    }
}
