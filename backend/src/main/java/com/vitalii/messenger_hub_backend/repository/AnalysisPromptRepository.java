package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.AnalysisPrompt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AnalysisPromptRepository extends JpaRepository<AnalysisPrompt, Long> {

    List<AnalysisPrompt> findByUserIdOrderByNameAsc(Long userId);

    /** Resolves a selection, filtered by owner so an id from the request cannot reach across users. */
    List<AnalysisPrompt> findByUserIdAndIdIn(Long userId, List<Long> ids);
}
