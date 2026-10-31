package com.vitalii.messenger_hub_backend.model.entity;

import com.vitalii.messenger_hub_backend.model.enums.AnalysisStatus;
import com.vitalii.messenger_hub_backend.model.enums.BatchRanking;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * One sweep across every chat and the ranking it produced; the model then reads only the top few.
 */
@Entity
@Table(
        name = "analysis_batches",
        indexes = @Index(name = "idx_analysis_batches_user", columnList = "user_id")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AnalysisStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "ranking", nullable = false, length = 24)
    private BatchRanking ranking;

    /** Only chats with at least this many archived messages are scanned. */
    @Column(name = "min_messages")
    private Integer minMessages;

    /** Whether groups and bots were included, or only one-to-one chats with people. */
    @Column(name = "people_only")
    private Boolean peopleOnly;

    @Column(name = "scanned_count")
    private Integer scannedCount;

    /** How many top-ranked chats the model was actually asked to read. */
    @Column(name = "model_top_n")
    private Integer modelTopN;

    @Column(name = "model")
    private String model;

    /** The full ranked table as JSON, stored because it describes the chats at one moment. */
    @Column(name = "table_json", columnDefinition = "TEXT")
    private String tableJson;

    @Column(name = "error", columnDefinition = "TEXT")
    private String error;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;
}
