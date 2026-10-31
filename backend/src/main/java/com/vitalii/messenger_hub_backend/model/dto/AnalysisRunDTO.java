package com.vitalii.messenger_hub_backend.model.dto;

import com.vitalii.messenger_hub_backend.model.enums.AnalysisStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/** One analysis, as the history page reads it. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisRunDTO {
    private Long id;
    private Long chatId;
    private String chatName;
    private AnalysisStatus status;
    private List<String> metrics;
    private String model;
    /** Shared by runs launched together on different models. */
    private String comparisonId;
    private Integer messageLimit;
    /** Computed figures, already parsed — the client never sees a JSON string. */
    private Object metricsResult;
    /** What the model returned, parsed. Null when no model ran or it failed. */
    private Object insights;
    /** Answers to the user's own questions, each with the question it answered. */
    private Object custom;
    /** Present alongside a result when only the model half went wrong. */
    private String error;
    private Long modelMs;
    private Integer messagesAnalysed;
    private LocalDateTime createdAt;
    private LocalDateTime finishedAt;
}
