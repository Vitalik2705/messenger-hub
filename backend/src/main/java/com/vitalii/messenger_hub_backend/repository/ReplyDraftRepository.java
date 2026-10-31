package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.ReplyDraft;
import com.vitalii.messenger_hub_backend.model.enums.DraftStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ReplyDraftRepository extends JpaRepository<ReplyDraft, Long> {

    /** The one waiting in a chat's composer, if any. */
    Optional<ReplyDraft> findFirstByChatIdAndStatusOrderByCreatedAtDesc(Long chatId, DraftStatus status);

    List<ReplyDraft> findTop100ByUserIdOrderByCreatedAtDesc(Long userId);

    /** Enforces the daily ceiling on messages actually sent by the system. */
    @Query("select count(d) from ReplyDraft d where d.user.id = :userId "
            + "and d.status = com.vitalii.messenger_hub_backend.model.enums.DraftStatus.AUTO_SENT "
            + "and d.createdAt >= :since")
    long countAutoSentSince(@Param("userId") Long userId, @Param("since") LocalDateTime since);

    /** Enforces the per-chat cooldown, counting anything the system produced. */
    @Query("select count(d) from ReplyDraft d where d.chat.id = :chatId and d.createdAt >= :since")
    long countForChatSince(@Param("chatId") Long chatId, @Param("since") LocalDateTime since);

    /** Acceptance statistics, as pairs of status and count. */
    @Query("select d.status, count(d) from ReplyDraft d where d.user.id = :userId group by d.status")
    List<Object[]> countByStatus(@Param("userId") Long userId);
}
