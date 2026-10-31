package com.vitalii.messenger_hub_backend.model.entity;

import com.vitalii.messenger_hub_backend.model.enums.AutoReplyMode;
import com.vitalii.messenger_hub_backend.model.enums.DraftStatus;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * One reply the model wrote, and what happened to it.
 *
 * Kept even after it is rejected. A draft nobody sent is the most informative record this
 * feature produces: the ratio of sent to edited to rejected is the only honest measure of
 * whether a 7B model is any good at answering these particular people.
 */
@Entity
@Table(
        name = "reply_drafts",
        indexes = {
                @Index(name = "idx_reply_drafts_user", columnList = "user_id"),
                @Index(name = "idx_reply_drafts_chat", columnList = "chat_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReplyDraft {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "chat_id", nullable = false)
    private Chat chat;

    @Column(name = "text", columnDefinition = "TEXT", nullable = false)
    private String text;

    /** What it was written in answer to, so a stale draft can be recognised as stale. */
    @Column(name = "based_on_message_id")
    private String basedOnMessageId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private DraftStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", length = 16)
    private AutoReplyMode mode;

    @Column(name = "model")
    private String model;

    @Column(name = "model_ms")
    private Long modelMs;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
}
