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
 * A summary of what arrived while the user was away, across all networks. Stored because the window
 * it describes cannot be recomputed later.
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

    /** Which chats were counted (people only, with groups, everything). */
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
