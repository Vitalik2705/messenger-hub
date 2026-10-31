package com.vitalii.messenger_hub_backend.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * How generated replies behave, for one user.
 *
 * Per-chat modes decide *where* the model may write; this decides *how* and *how often*.
 * The limits are not preferences — they are the brakes. A generation loop that answers its
 * own answer is the failure mode that writes fifty messages in somebody's name before it is
 * noticed, and a cooldown is what makes that impossible rather than unlikely.
 */
@Entity
@Table(name = "auto_reply_settings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AutoReplySettings {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    /** The master switch. Off means no chat generates anything, whatever its own mode says. */
    @Column(name = "enabled", nullable = false)
    private Boolean enabled;

    @Column(name = "model")
    private String model;

    /** Free-text guidance: tone, language, what to never promise. */
    @Column(name = "instructions", columnDefinition = "TEXT")
    private String instructions;

    /** Prefixed to every message sent in the labelled mode. */
    @Column(name = "disclosure", length = 300)
    private String disclosure;

    /** No second automatic message to the same chat inside this window. */
    @Column(name = "cooldown_minutes", nullable = false)
    private Integer cooldownMinutes;

    /** Hard ceiling on automatic sends per day, across every chat. */
    @Column(name = "daily_limit", nullable = false)
    private Integer dailyLimit;

    /** How many recent messages the model is shown as context. */
    @Column(name = "context_messages", nullable = false)
    private Integer contextMessages;

    /**
     * Hours during which nothing is sent, as 0–23. Drafts are still written: they wait in
     * the composer, and a suggestion prepared overnight costs the counterpart nothing.
     */
    @Column(name = "quiet_from_hour")
    private Integer quietFromHour;

    @Column(name = "quiet_to_hour")
    private Integer quietToHour;

    /** Upper bound on the generated reply, in characters. */
    @Column(name = "max_reply_chars")
    private Integer maxReplyChars;

    /**
     * Words that stop generation entirely when they appear in the incoming message.
     *
     * The setting that matters most in the sending modes: money, passwords, addresses —
     * subjects where a confident guess in someone's name does real damage. Comma separated.
     */
    @Column(name = "stop_words", columnDefinition = "TEXT")
    private String stopWords;

    /**
     * Incoming messages shorter than this are ignored.
     *
     * "ок", "+", a lone emoji — replying to those produces a conversation with nothing in
     * it, and in the sending modes it produces one the user never sees.
     */
    @Column(name = "min_incoming_chars")
    private Integer minIncomingChars;

    /** Sampling temperature. Low keeps the model close to how the user actually writes. */
    @Column(name = "temperature")
    private Double temperature;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** The defaults a user starts with: everything off, nothing sent. */
    public static AutoReplySettings defaultsFor(User user) {
        return AutoReplySettings.builder()
                .user(user)
                .enabled(false)
                .disclosure("🤖 Автовідповідь")
                .cooldownMinutes(30)
                .dailyLimit(20)
                .contextMessages(30)
                .quietFromHour(23)
                .quietToHour(8)
                .maxReplyChars(400)
                .minIncomingChars(3)
                .temperature(0.4)
                .stopWords("пароль, код, картка, гроші, переказ, адреса")
                .instructions("Відповідай коротко, українською, у дружньому тоні. "
                        + "Нічого не обіцяй і не погоджуйся на зустрічі чи домовленості — "
                        + "якщо питання цього вимагає, напиши, що відповіси пізніше.")
                .build();
    }
}
