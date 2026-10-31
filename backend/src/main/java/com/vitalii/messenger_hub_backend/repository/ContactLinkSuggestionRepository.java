package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.ContactLinkSuggestion;
import com.vitalii.messenger_hub_backend.model.enums.ContactLinkStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContactLinkSuggestionRepository extends JpaRepository<ContactLinkSuggestion, Long> {

    Optional<ContactLinkSuggestion> findByIdAndUserId(Long id, Long userId);

    List<ContactLinkSuggestion> findByUserIdAndStatusOrderByScoreDesc(
            Long userId, ContactLinkStatus status);

    /**
     * Looks up a pair in stored order. Callers must normalise the two ids first — see
     * {@link ContactLinkSuggestion}.
     */
    Optional<ContactLinkSuggestion> findByIdentityAIdAndIdentityBId(Long identityAId, Long identityBId);

    /**
     * Pairs the matcher must not propose again: already decided either way, or still waiting
     * for an answer.
     */
    @Query("select concat(s.identityA.id, ':', s.identityB.id) from ContactLinkSuggestion s " +
            "where s.user.id = :userId")
    List<String> findKnownPairKeys(@Param("userId") Long userId);

    /** Every proposal touching an identity, in either position. */
    @Query("select s from ContactLinkSuggestion s where s.user.id = :userId " +
            "and (s.identityA.id = :identityId or s.identityB.id = :identityId)")
    List<ContactLinkSuggestion> findInvolving(@Param("userId") Long userId,
                                              @Param("identityId") Long identityId);

    long countByUserIdAndStatus(Long userId, ContactLinkStatus status);
}
