package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.AnalysisRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AnalysisRunRepository extends JpaRepository<AnalysisRun, Long> {

    /** The history page: newest first, capped because nobody scrolls past fifty. */
    List<AnalysisRun> findTop50ByUserIdOrderByCreatedAtDesc(Long userId);

    List<AnalysisRun> findByUserIdAndChatIdOrderByCreatedAtDesc(Long userId, Long chatId);

    /** The other side of a comparison, in the order the models were requested. */
    List<AnalysisRun> findByComparisonIdOrderByIdAsc(String comparisonId);
}
