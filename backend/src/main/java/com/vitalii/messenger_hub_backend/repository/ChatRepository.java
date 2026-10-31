package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.Chat;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChatRepository extends JpaRepository<Chat, Long> {

    List<Chat> findByUserIdOrderByLastMessageAtDesc(Long userId);

    List<Chat> findByMessengerAccountIdOrderByLastMessageAtDesc(Long messengerAccountId);

    Optional<Chat> findByMessengerAccountIdAndExternalChatId(Long messengerAccountId, String externalChatId);

    List<Chat> findAllByMessengerAccountId(Long messengerAccountId);

    Optional<Chat> findFirstByUserIdAndExternalChatId(Long userId, String externalChatId);

    // ── Background archiving ──────────────────────────────────────────────────

    /**
     * Chats of connected accounts, least recently backfilled first so the archiver cycles through
     * all of them. A projection, because the caller makes network calls between rows.
     * Columns: chatId, externalChatId, messengerAccountId, userId, messengerType.
     */
    @Query("select c.id, c.externalChatId, ma.id, u.id, ma.messengerType " +
            "from Chat c join c.messengerAccount ma join ma.user u " +
            "where ma.isConnected = true " +
            "and (c.lastArchivedAt is null or c.lastArchivedAt < :notArchivedSince) " +
            "order by c.lastArchivedAt asc nulls first, c.lastMessageAt desc nulls last")
    List<Object[]> findChatsDueForArchiving(@Param("notArchivedSince") LocalDateTime notArchivedSince,
                                            Pageable pageable);

    @Modifying
    @Transactional
    @Query("update Chat c set c.lastArchivedAt = :archivedAt where c.id = :chatId")
    void markArchived(@Param("chatId") Long chatId, @Param("archivedAt") LocalDateTime archivedAt);

    /**
     * The owner's email as a projection: chats handed to background jobs are detached, so
     * chat.getUser() cannot be initialised there.
     */
    @Query("select c.user.email from Chat c where c.id = :chatId")
    Optional<String> findOwnerEmail(@Param("chatId") Long chatId);

    // ── Contact linking ───────────────────────────────────────────────────────

    /**
     * Named one-to-one chats — the only ones that stand for a person. A group's name describes the
     * room.
     */
    @Query("select c from Chat c join fetch c.messengerAccount ma " +
            "where c.user.id = :userId " +
            "and (c.chatType is null or upper(c.chatType) = 'PERSONAL') " +
            "and c.name is not null and c.name <> ''")
    List<Chat> findPersonalChats(@Param("userId") Long userId);
}