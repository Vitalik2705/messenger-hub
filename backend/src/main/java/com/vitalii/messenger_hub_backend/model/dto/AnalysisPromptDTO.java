package com.vitalii.messenger_hub_backend.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A user-written question, as the settings page reads it. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisPromptDTO {
    private Long id;
    private String name;
    private String prompt;
    private LocalDateTime updatedAt;
}
