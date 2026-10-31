package com.vitalii.messenger_hub_backend.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "messages",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_messages_chat_external",
                columnNames = {"chat_id", "external_message_id"}),
        indexes = @Index(
                name = "idx_messages_chat_timestamp",
                columnList = "chat_id, timestamp")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chat_id", nullable = false)
    private Chat chat;

    @Column(name = "external_message_id")
    private String externalMessageId;

    @Column(name = "sender_id")
    private String senderId;

    @Column(name = "sender_name")
    private String senderName;

    @Column(name = "text", columnDefinition = "TEXT")
    private String text;

    @Column(name = "attachments", columnDefinition = "TEXT")
    private String attachments; // JSON

    @Builder.Default
    @Column(name = "is_from_user")
    private Boolean isFromUser = false;

    /**
     * The transcript of a voice message, kept separate from the text: the text is what was sent,
     * the transcript a derived and possibly wrong reading.
     */
    @Column(name = "transcript", columnDefinition = "TEXT")
    private String transcript;

    /** PENDING, DONE, FAILED, SKIPPED — so a failed clip is not retried forever. */
    @Column(name = "transcript_status", length = 16)
    private String transcriptStatus;

    @Column(name = "status")
    private String status; // SENT, DELIVERED, READ

    @Column(name = "timestamp", nullable = false)
    private LocalDateTime timestamp;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}