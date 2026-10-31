package com.vitalii.messenger_hub_backend.model.entity;

import com.vitalii.messenger_hub_backend.model.enums.AnalysisStatus;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * One analysis of one chat, kept forever.
 *
 * A run is stored rather than recomputed because it is not reproducible: it describes the
 * conversation as it stood at a moment in time, and it cost real seconds of local inference
 * to produce. Keeping every run also makes the history page possible — the user compares
 * what a chat looked like in March against what it looks like now, which no live query
 * over the current archive could ever answer.
 *
 * The settings are stored on the run, not in a separate profile: the only honest way to
 * read a result is against the exact configuration that produced it, including which model
 * wrote it.
 */
@Entity
@Table(
        name = "analysis_runs",
        indexes = {
                @Index(name = "idx_analysis_runs_user", columnList = "user_id"),
                @Index(name = "idx_analysis_runs_chat", columnList = "chat_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "chat_id", nullable = false)
    private Chat chat;

    /**
     * The chat's name at the time of the run.
     *
     * Copied rather than read through the relation so the history stays readable after a
     * counterpart renames themselves — or after the chat is gone from the messenger.
     */
    @Column(name = "chat_name")
    private String chatName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AnalysisStatus status;

    /** Selected metric keys, comma separated. */
    @Column(name = "metrics", length = 512)
    private String metrics;

    /** Null when the run was metrics-only. */
    @Column(name = "model")
    private String model;

    /**
     * Ties runs of the same chat launched together on different models.
     *
     * Separate rows rather than one row with two results: each model has its own duration,
     * its own failure, its own output, and flattening them into one record would lose
     * exactly the differences the comparison exists to show.
     */
    @Column(name = "comparison_id", length = 40)
    private String comparisonId;

    /** Set when this run was queued by a batch sweep rather than asked for directly. */
    @Column(name = "batch_id")
    private Long batchId;

    /** How many of the most recent messages the model was shown. */
    @Column(name = "message_limit")
    private Integer messageLimit;

    /** The computed metrics, as JSON. Present even when the model half failed. */
    @Column(name = "metrics_json", columnDefinition = "TEXT")
    private String metricsJson;

    /** What the model produced for the built-in summary. Null when it did not run. */
    @Column(name = "insights_json", columnDefinition = "TEXT")
    private String insightsJson;

    /**
     * Answers to the user's own questions, as a JSON array.
     *
     * Each entry carries the question's name and text alongside the answer rather than a
     * reference to the prompt row. A stored result has to stay readable after its prompt is
     * reworded or deleted — otherwise the history would quietly start attributing old
     * answers to a question nobody asked.
     */
    @Column(name = "custom_json", columnDefinition = "TEXT")
    private String customJson;

    /** Whether the built-in summary was asked for on this run. */
    @Column(name = "include_summary")
    private Boolean includeSummary;

    /** Which prompts were selected, comma separated — resolved to text when the run starts. */
    @Column(name = "prompt_ids", length = 512)
    private String promptIds;

    @Column(name = "error", columnDefinition = "TEXT")
    private String error;

    /** Wall-clock time of the model call, which is the part worth measuring. */
    @Column(name = "model_ms")
    private Long modelMs;

    @Column(name = "messages_analysed")
    private Integer messagesAnalysed;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;
}
