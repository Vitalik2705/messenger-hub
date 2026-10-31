package com.vitalii.messenger_hub_backend.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A user-written question asked of conversations (e.g. "чи є тут ознаки конфлікту"). Stored per
 * user and reusable across chats, so the same question can be compared between chats.
 */
@Entity
@Table(
        name = "analysis_prompts",
        indexes = @Index(name = "idx_analysis_prompts_user", columnList = "user_id")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisPrompt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Short label, shown on the result card. */
    @Column(name = "name", nullable = false, length = 120)
    private String name;

    /** The question itself, in free text. */
    @Column(name = "prompt", nullable = false, columnDefinition = "TEXT")
    private String prompt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
