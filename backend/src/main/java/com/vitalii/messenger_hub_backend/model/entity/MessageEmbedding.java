package com.vitalii.messenger_hub_backend.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One message, as a vector.
 *
 * Stored as packed float32 bytes rather than a Postgres array or a pgvector column. The
 * reason is scale, and it cuts the other way from what one expects: pgvector earns its keep
 * at millions of rows, where an approximate index beats a scan. One person's archive is
 * tens of thousands — a full scan over that is a few million multiply-adds, which is
 * milliseconds. Adding a database extension to avoid milliseconds would be paying setup
 * cost for nothing.
 *
 * The bytes are also the compact form: 768 dimensions is 3 KB here against roughly 9 KB as
 * text, and the whole archive fits comfortably in memory for searching.
 */
@Entity
@Table(
        name = "message_embeddings",
        indexes = {
                @Index(name = "idx_message_embeddings_user", columnList = "user_id"),
                @Index(name = "idx_message_embeddings_message", columnList = "message_id", unique = true)
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageEmbedding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(name = "chat_id", nullable = false)
    private Long chatId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Vectors from different models are not comparable, so the model is part of the record. */
    @Column(name = "model", nullable = false, length = 80)
    private String model;

    @Column(name = "dim", nullable = false)
    private Integer dim;

    @Lob
    @Column(name = "vector", nullable = false)
    private byte[] vector;
}
