package com.vitalii.messenger_hub_backend.model.entity;

import com.vitalii.messenger_hub_backend.model.enums.AnalysisStatus;
import com.vitalii.messenger_hub_backend.model.enums.DigestScope;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * What happened while the user was away.
 *
 * The one thing an aggregator is uniquely placed to answer: not "what is in this chat" but
 * "what did I miss, across all five networks, and does any of it need me". Every messenger
 * can show its own unread count; none of them can rank a Slack thread against a Telegram
 * message from a friend.
 *
 * Kept rather than regenerated because it describes a window that has closed. Yesterday's
 * digest cannot be recomputed tomorrow — by then the messages have been read, answered, or
 * buried, and the counts that made them notable are gone.
 */
@Entity
@Table(
        name = "digests",
        indexes = @Index(name = "idx_digests_user", columnList = "user_id")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Digest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AnalysisStatus status;

    /** The window the digest covers. */
    @Column(name = "from_at", nullable = false)
    private LocalDateTime fromAt;

    @Column(name = "to_at", nullable = false)
    private LocalDateTime toAt;

    /**
     * Which chats were counted. Stored rather than assumed: a digest of people only and a
     * digest of everything produce very different numbers, and the history shows both.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "scope", length = 24)
    private DigestScope scope;

    /** Null when the digest is counts only — which is still a useful digest. */
    @Column(name = "model")
    private String model;

    /** How many of the busiest chats the model was asked to summarise. */
    @Column(name = "model_top_n")
    private Integer modelTopN;

    @Column(name = "chats_touched")
    private Integer chatsTouched;

    @Column(name = "messages_received")
    private Integer messagesReceived;

    /** The per-chat entries, as JSON: who wrote, how much, whether it is still unanswered. */
    @Column(name = "items_json", columnDefinition = "TEXT")
    private String itemsJson;

    @Column(name = "error", columnDefinition = "TEXT")
    private String error;

    @Column(name = "model_ms")
    private Long modelMs;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;
}
