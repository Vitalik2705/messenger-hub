package com.vitalii.messenger_hub_backend.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A message's vector as packed float32 bytes (a large object), not a pgvector column. pgvector pays
 * off at millions of rows; one person's archive is tens of thousands, and a full in-memory scan
 * takes milliseconds. 1024 dimensions take 4 KB.
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
