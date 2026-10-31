package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.AnalysisBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AnalysisBatchRepository extends JpaRepository<AnalysisBatch, Long> {
    List<AnalysisBatch> findTop30ByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * The owner's email and id, read without touching the entity's lazy association.
     *
     * The batch runs outside any transaction — deliberately, because it makes dozens of short
     * reads instead of holding one connection through minutes of inference. That leaves the
     * loaded batch detached, so reaching through {@code batch.getUser()} throws. These two
     * queries fetch what the run actually needs, each in its own short read.
     */
    @Query("select b.user.email from AnalysisBatch b where b.id = :id")
    String findOwnerEmail(@Param("id") Long id);

    @Query("select b.user.id from AnalysisBatch b where b.id = :id")
    Long findOwnerId(@Param("id") Long id);
}
