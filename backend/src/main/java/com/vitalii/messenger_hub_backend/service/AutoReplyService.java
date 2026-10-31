package com.vitalii.messenger_hub_backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.entity.*;
import com.vitalii.messenger_hub_backend.model.enums.AutoReplyMode;
import com.vitalii.messenger_hub_backend.model.enums.ChatKind;
import com.vitalii.messenger_hub_backend.model.enums.DraftStatus;
import com.vitalii.messenger_hub_backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Writes replies on the user's behalf, as far as each chat allows. The three modes share one
 * pipeline and differ only at the end: DRAFT stops before sending, AUTO_LABELED sends with a note,
 * AUTO sends without one. Most of the class decides whether to reply at all.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AutoReplyService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("dd.MM HH:mm");

    /**
     * The reply alone, as a JSON field, so commentary like "Ось варіант відповіді:" can never be
     * sent.
     */
    private static final String SYSTEM = """
            Ти пишеш відповідь у приватному листуванні ВІД ІМЕНІ користувача.
            Відповідай ВИКЛЮЧНО валідним JSON: {"reply": "текст відповіді"}
            Пиши так, як пише сам користувач у наведеному листуванні: та сама мова,
            та сама довжина реплік, той самий рівень формальності.
            Без пояснень, без вступів, без лапок навколо відповіді.
            Якщо відповісти неможливо без інформації, якої в листуванні немає —
            напиши коротко, що відповіси пізніше.
            """;

    private final ChatRepository chatRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final AutoReplySettingsRepository settingsRepository;
    private final ReplyDraftRepository draftRepository;
    private final OllamaClient ollama;
    private final MessengerDispatch dispatch;

    // ── Settings ──────────────────────────────────────────────────────────────

    @Transactional
    public AutoReplySettings settingsFor(String email) {
        User user = userService.findByEmail(email);
        return settingsRepository.findByUserId(user.getId())
                .orElseGet(() -> settingsRepository.save(AutoReplySettings.defaultsFor(user)));
    }

    @Transactional
    public AutoReplySettings updateSettings(String email, AutoReplySettings incoming) {
        AutoReplySettings settings = settingsFor(email);
        if (incoming.getEnabled() != null) settings.setEnabled(incoming.getEnabled());
        if (incoming.getModel() != null) settings.setModel(incoming.getModel().isBlank() ? null : incoming.getModel());
        if (incoming.getInstructions() != null) settings.setInstructions(incoming.getInstructions());
        if (incoming.getDisclosure() != null) settings.setDisclosure(incoming.getDisclosure());
        // Clamped rather than trusted: these are the brakes, and a zero cooldown with a
        // thousand-message ceiling is a request to write in someone's name unattended.
        if (incoming.getCooldownMinutes() != null) {
            settings.setCooldownMinutes(Math.max(1, Math.min(incoming.getCooldownMinutes(), 24 * 60)));
        }
        if (incoming.getDailyLimit() != null) {
            settings.setDailyLimit(Math.max(1, Math.min(incoming.getDailyLimit(), 200)));
        }
        if (incoming.getContextMessages() != null) {
            settings.setContextMessages(Math.max(5, Math.min(incoming.getContextMessages(), 200)));
        }
        if (incoming.getMaxReplyChars() != null) {
            settings.setMaxReplyChars(Math.max(40, Math.min(incoming.getMaxReplyChars(), 2000)));
        }
        if (incoming.getMinIncomingChars() != null) {
            settings.setMinIncomingChars(Math.max(0, Math.min(incoming.getMinIncomingChars(), 200)));
        }
        if (incoming.getTemperature() != null) {
            settings.setTemperature(Math.max(0.0, Math.min(incoming.getTemperature(), 1.2)));
        }
        if (incoming.getStopWords() != null) settings.setStopWords(incoming.getStopWords());
        // Both or neither: half a window is not a window, and leaving one side set would
        // silently mean "quiet from 23:00 until never".
        if (incoming.getQuietFromHour() != null && incoming.getQuietToHour() != null) {
            settings.setQuietFromHour(wrapHour(incoming.getQuietFromHour()));
            settings.setQuietToHour(wrapHour(incoming.getQuietToHour()));
        }
        return settingsRepository.save(settings);
    }

    @Transactional(readOnly = true)
    public AutoReplyMode chatMode(String email, Long chatId) {
        Long userId = userService.findByEmail(email).getId();
        return chatRepository.findById(chatId)
                .filter(chat -> chat.getUser().getId().equals(userId))
                .map(chat -> chat.getAutoReplyMode() == null ? AutoReplyMode.OFF : chat.getAutoReplyMode())
                .orElse(AutoReplyMode.OFF);
    }

    @Transactional
    public Chat setChatMode(String email, Long chatId, AutoReplyMode mode) {
        Long userId = userService.findByEmail(email).getId();
        Chat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new CustomException("Чат не знайдено", HttpStatus.NOT_FOUND));
        if (!chat.getUser().getId().equals(userId)) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }
        // Automatic sending is for one-to-one conversations with people. A group would get
        // an answer to a message that was not addressed to the user at all, and a channel
        // cannot be replied to in the first place.
        if (mode != AutoReplyMode.OFF && mode != AutoReplyMode.DRAFT
                && chat.getChatKind() != null && chat.getChatKind() != ChatKind.PERSON) {
            throw new CustomException(
                    "Автовідправка доступна лише в особистих чатах з людьми", HttpStatus.BAD_REQUEST);
        }
        chat.setAutoReplyMode(mode);
        return chatRepository.save(chat);
    }

    // ── Drafts the client reads ───────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Optional<ReplyDraft> pendingDraft(String email, Long chatId) {
        Long userId = userService.findByEmail(email).getId();
        return draftRepository.findFirstByChatIdAndStatusOrderByCreatedAtDesc(chatId, DraftStatus.PENDING)
                .filter(draft -> draft.getUser().getId().equals(userId));
    }

    @Transactional
    public void resolveDraft(String email, Long draftId, DraftStatus status) {
        Long userId = userService.findByEmail(email).getId();
        ReplyDraft draft = draftRepository.findById(draftId)
                .orElseThrow(() -> new CustomException("Чернетку не знайдено", HttpStatus.NOT_FOUND));
        if (!draft.getUser().getId().equals(userId)) {
            throw new CustomException("Access denied", HttpStatus.FORBIDDEN);
        }
        draft.setStatus(status);
        draft.setResolvedAt(LocalDateTime.now());
        draftRepository.save(draft);
    }

    @Transactional(readOnly = true)
    public Map<String, Long> acceptanceStats(String email) {
        Long userId = userService.findByEmail(email).getId();
        Map<String, Long> stats = new LinkedHashMap<>();
        for (DraftStatus status : DraftStatus.values()) stats.put(status.name(), 0L);
        for (Object[] row : draftRepository.countByStatus(userId)) {
            stats.put(((DraftStatus) row[0]).name(), (Long) row[1]);
        }
        return stats;
    }

    // ── Generation ────────────────────────────────────────────────────────────

    /**
     * Decides whether this chat should get a reply now and produces one if so. Runs off the request
     * thread after new messages are archived; each early return is a guard for all modes.
     */
    @Transactional
    public void considerReplying(Long chatId) {
        Chat chat = chatRepository.findById(chatId).orElse(null);
        if (chat == null) return;

        AutoReplyMode mode = chat.getAutoReplyMode();
        if (mode == null || mode == AutoReplyMode.OFF) return;

        User owner = userRepository.findById(chat.getUser().getId()).orElse(null);
        if (owner == null) return;

        AutoReplySettings settings = settingsRepository.findByUserId(owner.getId()).orElse(null);
        // The master switch, and the reason it exists: one flag turns everything off
        // without having to walk back through every chat that was ever enabled.
        if (settings == null || !Boolean.TRUE.equals(settings.getEnabled())) return;
        if (settings.getModel() == null) return;

        List<Message> recent = new ArrayList<>(messageRepository.findByChatIdOrderByTimestampDesc(
                chatId, PageRequest.of(0, settings.getContextMessages())));
        if (recent.isEmpty()) return;

        Message last = recent.get(0);
        // Answering our own message is the loop that writes forty times in a row.
        if (Boolean.TRUE.equals(last.getIsFromUser())) return;

        String incoming = last.getText() == null ? "" : last.getText().trim();

        // "ок", "+", a lone emoji. Answering these produces an exchange with nothing in it.
        int minChars = settings.getMinIncomingChars() == null ? 0 : settings.getMinIncomingChars();
        if (incoming.length() < minChars) {
            log.debug("Auto-reply skipped for chat {}: incoming message too short", chatId);
            return;
        }

        if (mentionsStopWord(incoming, settings.getStopWords())) {
            log.info("Auto-reply skipped for chat {}: incoming message hit a stop word", chatId);
            return;
        }

        // Quiet hours bind the sending modes only. A draft written at 3am simply waits.
        if (mode != AutoReplyMode.DRAFT && inQuietHours(settings)) {
            log.debug("Auto-reply skipped for chat {}: quiet hours", chatId);
            return;
        }

        LocalDateTime cooldownStart = LocalDateTime.now().minusMinutes(settings.getCooldownMinutes());
        if (draftRepository.countForChatSince(chatId, cooldownStart) > 0) {
            log.debug("Auto-reply skipped for chat {}: within cooldown", chatId);
            return;
        }

        if (mode != AutoReplyMode.DRAFT) {
            long today = draftRepository.countAutoSentSince(
                    owner.getId(), LocalDateTime.now().minusDays(1));
            if (today >= settings.getDailyLimit()) {
                log.info("Auto-reply skipped for chat {}: daily limit {} reached", chatId, settings.getDailyLimit());
                return;
            }
        }

        Collections.reverse(recent);
        String text;
        long elapsed;
        try {
            OllamaClient.Generation generation = ollama.generateJson(
                    settings.getModel(), SYSTEM, buildPrompt(chat, recent, settings),
                    settings.getTemperature());
            text = clamp(extractReply(generation.json()), settings.getMaxReplyChars());
            elapsed = generation.elapsedMs();
        } catch (OllamaClient.OllamaUnavailableException e) {
            log.warn("Auto-reply for chat {} skipped: {}", chatId, e.getMessage());
            return;
        }
        if (text == null || text.isBlank()) return;

        ReplyDraft draft = ReplyDraft.builder()
                .user(owner)
                .chat(chat)
                .text(text)
                .basedOnMessageId(last.getExternalMessageId())
                .mode(mode)
                .model(settings.getModel())
                .modelMs(elapsed)
                .status(mode == AutoReplyMode.DRAFT ? DraftStatus.PENDING : DraftStatus.AUTO_SENT)
                .build();

        if (mode == AutoReplyMode.DRAFT) {
            draftRepository.save(draft);
            log.info("Draft reply ready for chat {} ({} ms)", chatId, elapsed);
            return;
        }

        String outgoing = mode == AutoReplyMode.AUTO_LABELED
                ? disclose(settings.getDisclosure(), text)
                : text;
        try {
            dispatch.send(chat, owner.getId(), outgoing);
            draft.setText(outgoing);
            draft.setResolvedAt(LocalDateTime.now());
            draftRepository.save(draft);
            log.info("Auto-replied in chat {} mode {} ({} ms)", chatId, mode, elapsed);
        } catch (Exception e) {
            // Recorded as rejected rather than sent: the daily counter must never charge
            // for a message that did not go out.
            draft.setStatus(DraftStatus.REJECTED);
            draft.setResolvedAt(LocalDateTime.now());
            draftRepository.save(draft);
            log.warn("Auto-reply send failed for chat {}: {}", chatId, e.getMessage());
        }
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private static int wrapHour(int hour) {
        return Math.floorMod(hour, 24);
    }

    /** Whether now is in the quiet window, which may wrap past midnight (e.g. 23:00–08:00). */
    private boolean inQuietHours(AutoReplySettings settings) {
        Integer from = settings.getQuietFromHour();
        Integer to = settings.getQuietToHour();
        if (from == null || to == null || from.equals(to)) return false;
        int hour = LocalDateTime.now().getHour();
        return from < to ? (hour >= from && hour < to) : (hour >= from || hour < to);
    }

    private boolean mentionsStopWord(String incoming, String stopWords) {
        if (stopWords == null || stopWords.isBlank() || incoming.isBlank()) return false;
        String haystack = incoming.toLowerCase();
        for (String word : stopWords.split(",")) {
            String needle = word.trim().toLowerCase();
            if (!needle.isEmpty() && haystack.contains(needle)) return true;
        }
        return false;
    }

    /** Truncated at a word boundary where possible — a reply cut mid-word reads as a bug. */
    private String clamp(String text, Integer limit) {
        if (limit == null || text.length() <= limit) return text;
        String cut = text.substring(0, limit);
        int lastSpace = cut.lastIndexOf(' ');
        return (lastSpace > limit * 0.6 ? cut.substring(0, lastSpace) : cut).trim() + "…";
    }

    private String disclose(String disclosure, String text) {
        String label = disclosure == null || disclosure.isBlank() ? "🤖 Автовідповідь" : disclosure.trim();
        return label + "\n" + text;
    }

    private String buildPrompt(Chat chat, List<Message> messages, AutoReplySettings settings) {
        String counterpart = chat.getName() == null || chat.getName().isBlank()
                ? "Співрозмовник" : chat.getName();

        StringBuilder prompt = new StringBuilder();
        if (settings.getInstructions() != null && !settings.getInstructions().isBlank()) {
            prompt.append("Вказівки користувача: ").append(settings.getInstructions().trim()).append("\n\n");
        }
        prompt.append("Листування з «").append(counterpart).append("»:\n\n");

        for (Message message : messages) {
            String text = message.getText();
            if (text == null || text.isBlank()) continue;
            prompt.append('[')
                    .append(message.getTimestamp() == null ? "?" : STAMP.format(message.getTimestamp()))
                    .append("] ")
                    .append(Boolean.TRUE.equals(message.getIsFromUser()) ? "Користувач" : counterpart)
                    .append(": ")
                    .append(text.length() > 400 ? text.substring(0, 400) + "…" : text)
                    .append('\n');
        }
        prompt.append("\nНапиши наступну репліку користувача.");
        return prompt.toString();
    }

    private String extractReply(String json) {
        try {
            JsonNode node = JSON.readTree(json);
            String reply = node.path("reply").asText(null);
            return reply == null || reply.isBlank() ? null : reply.trim();
        } catch (Exception e) {
            log.debug("Auto-reply output was not the expected JSON: {}", e.getMessage());
            return null;
        }
    }
}
