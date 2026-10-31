package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.AnalysisBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AnalysisBatchRepository extends JpaRepository<AnalysisBatch, Long> {
    List<AnalysisBatch> findTop30ByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * The owner's email and id without touching the lazy association: batches run outside a
     * transaction, so the loaded entity is detached.
     */
    @Query("select b.user.email from AnalysisBatch b where b.id = :id")
    String findOwnerEmail(@Param("id") Long id);

    @Query("select b.user.id from AnalysisBatch b where b.id = :id")
    Long findOwnerId(@Param("id") Long id);
}
