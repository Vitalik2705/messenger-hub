package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByChatIdOrderByTimestampDesc(Long chatId, Pageable pageable);

    List<Message> findByChatIdOrderByTimestampDesc(Long chatId);

    /**
     * Which of the given external IDs are already archived for this chat.
     * Used to keep archiving idempotent without a round-trip per message.
     */
    @Query("select m.externalMessageId from Message m " +
            "where m.chat.id = :chatId and m.externalMessageId in :externalIds")
    Set<String> findExistingExternalIds(@Param("chatId") Long chatId,
                                        @Param("externalIds") Collection<String> externalIds);

    long countByChatId(Long chatId);

    /** Resolves the messenger's own ids to our row — the client never sees database ids. */
    @Query(value = """
            SELECT m.id FROM messages m
            JOIN chats c ON c.id = m.chat_id
            WHERE c.messenger_account_id = :accountId
              AND c.external_chat_id = :externalChatId
              AND m.external_message_id = :externalMessageId
            LIMIT 1
            """, nativeQuery = true)
    Long findIdByExternalIds(@Param("accountId") Long accountId,
                             @Param("externalChatId") String externalChatId,
                             @Param("externalMessageId") String externalMessageId);

    /** Everything needed to fetch one message's audio back from its messenger. */
    @Query(value = """
            SELECT m.external_message_id, c.external_chat_id, c.messenger_account_id,
                   c.user_id, a.messenger_type, m.transcript
            FROM messages m
            JOIN chats c ON c.id = m.chat_id
            JOIN messenger_accounts a ON a.id = c.messenger_account_id
            WHERE m.id = :messageId
            """, nativeQuery = true)
    List<Object[]> findMediaRoute(@Param("messageId") Long messageId);

    /**
     * Chats of the given kinds that received something in a window, busiest first.
     *
     * Counts only what came in: a digest is about what arrived, and messages the user sent
     * themselves are not news to them.
     *
     * Chats archived before {@code chat_kind} existed have none, so the coarse chat type
     * stands in for them — the same fallback {@code ChatKind.parse} applies, kept here so a
     * pre-upgrade chat is filtered rather than silently dropped by an IN over NULL.
     */
    @Query(value = """
            SELECT c.id, c.name, a.messenger_type, count(*) AS incoming,
                   max(m.timestamp) AS last_at, c.chat_kind
            FROM messages m
            JOIN chats c ON c.id = m.chat_id
            JOIN messenger_accounts a ON a.id = c.messenger_account_id
            WHERE c.user_id = :userId
              AND m.is_from_user = false
              AND m.timestamp >= :since
              AND coalesce(c.chat_kind, CASE
                      WHEN upper(coalesce(c.chat_type, '')) = 'GROUP' THEN 'GROUP'
                      WHEN upper(coalesce(c.chat_type, '')) = 'CHANNEL' THEN 'CHANNEL'
                      ELSE 'PERSON' END) IN (:kinds)
            GROUP BY c.id, c.name, a.messenger_type, c.chat_kind
            ORDER BY incoming DESC
            """, nativeQuery = true)
    List<Object[]> findIncomingSince(@Param("userId") Long userId,
                                     @Param("since") LocalDateTime since,
                                     @Param("kinds") List<String> kinds);

    /** Whether the last thing said in a chat came from the other side. */
    @Query(value = """
            SELECT m.is_from_user FROM messages m
            WHERE m.chat_id = :chatId
            ORDER BY m.timestamp DESC LIMIT 1
            """, nativeQuery = true)
    Boolean lastMessageIsFromUser(@Param("chatId") Long chatId);

    /** The window's incoming text of one chat, oldest first, for the model to read. */
    @Query(value = """
            SELECT coalesce(m.text, m.transcript) FROM messages m
            WHERE m.chat_id = :chatId
              AND m.is_from_user = false
              AND m.timestamp >= :since
              AND coalesce(m.text, m.transcript) IS NOT NULL
            ORDER BY m.timestamp ASC
            LIMIT 60
            """, nativeQuery = true)
    List<String> findIncomingTextsSince(@Param("chatId") Long chatId, @Param("since") LocalDateTime since);

    /** Transcripts of one chat, keyed by the messenger's own message id. */
    @Query("select m.externalMessageId, m.transcript from Message m "
            + "where m.chat.id = :chatId and m.transcript is not null")
    List<Object[]> findTranscripts(@Param("chatId") Long chatId);

    /**
     * Voice messages that have not been transcribed yet, newest first.
     *
     * Media is not archived, so the audio has to be re-fetched from the messenger for each
     * of these — which is why the batch is small and the job is slow.
     */
    @Query(value = """
            SELECT m.id, m.external_message_id, c.external_chat_id, c.messenger_account_id
            FROM messages m
            JOIN chats c ON c.id = m.chat_id
            JOIN messenger_accounts a ON a.id = c.messenger_account_id
            WHERE a.messenger_type = 'TELEGRAM'
              AND m.attachments LIKE '%"type":"audio"%'
              AND m.transcript_status IS NULL
            ORDER BY m.timestamp DESC
            LIMIT :batchSize
            """, nativeQuery = true)
    List<Object[]> findUntranscribedVoice(@Param("batchSize") int batchSize);

    @Query(value = """
            SELECT count(*) FROM messages m
            JOIN chats c ON c.id = m.chat_id
            JOIN messenger_accounts a ON a.id = c.messenger_account_id
            WHERE c.user_id = :userId
              AND a.messenger_type = 'TELEGRAM'
              AND m.attachments LIKE '%"type":"audio"%'
            """, nativeQuery = true)
    long countVoiceMessages(@Param("userId") Long userId);

    @Query(value = """
            SELECT count(*) FROM messages m
            JOIN chats c ON c.id = m.chat_id
            WHERE c.user_id = :userId AND m.transcript IS NOT NULL
            """, nativeQuery = true)
    long countTranscribed(@Param("userId") Long userId);

    /**
     * Removes an archived copy after the message was deleted in the messenger.
     *
     * Without this the archive would quietly outlive the deletion: the message would stay
     * searchable and keep being pushed over WebSocket, which turns "delete" into "hide".
     */
    @Modifying
    @Transactional
    @Query("delete from Message m where m.chat.id = :chatId " +
            "and m.externalMessageId = :externalMessageId")
    int deleteArchived(@Param("chatId") Long chatId,
                       @Param("externalMessageId") String externalMessageId);

    // ── Corpus statistics ─────────────────────────────────────────────────────

    @Query("select count(m) from Message m where m.chat.user.id = :userId")
    long countByUserId(@Param("userId") Long userId);

    @Query("select count(distinct m.chat.id) from Message m where m.chat.user.id = :userId")
    long countChatsWithMessages(@Param("userId") Long userId);

    @Query("select min(m.timestamp) from Message m where m.chat.user.id = :userId")
    LocalDateTime findOldestTimestamp(@Param("userId") Long userId);

    @Query("select max(m.timestamp) from Message m where m.chat.user.id = :userId")
    LocalDateTime findNewestTimestamp(@Param("userId") Long userId);

    @Query("select c.messengerAccount.messengerType, count(m) from Message m join m.chat c " +
            "where c.user.id = :userId group by c.messengerAccount.messengerType")
    List<Object[]> countGroupedByMessengerType(@Param("userId") Long userId);

    // ── Full-text search ──────────────────────────────────────────────────────

    /**
     * Ranked search across everything the user has archived, in every messenger at once.
     *
     * Columns, in order: id, chatId, chatName, messengerType, senderName, isFromUser,
     * timestamp, text, snippet, rank.
     *
     * The query is native because {@code tsvector}, {@code ts_rank_cd} and
     * {@code ts_headline} have no JPQL equivalent. {@code :tsquery} is not raw user input —
     * {@link com.vitalii.messenger_hub_backend.service.MessageSearchService} builds it from
     * sanitised tokens, since {@code to_tsquery} raises on malformed syntax.
     *
     * Every optional filter is cast explicitly: an untyped NULL bind leaves Postgres unable
     * to infer the parameter's type and the statement fails to plan.
     */
    @Query(value = """
            SELECT m.id,
                   m.chat_id,
                   c.name,
                   ma.messenger_type,
                   m.sender_name,
                   m.is_from_user,
                   m.timestamp,
                   m.text,
                   ts_headline('simple', coalesce(m.text, ''), tsq.q,
                               'StartSel=[[hl]],StopSel=[[/hl]],MaxFragments=2,MaxWords=20,MinWords=6,FragmentDelimiter= … '),
                   ts_rank_cd(m.search_vector, tsq.q) AS rank_score
            FROM messages m
            JOIN chats c ON c.id = m.chat_id
            JOIN messenger_accounts ma ON ma.id = c.messenger_account_id
            CROSS JOIN to_tsquery('simple', :tsquery) AS tsq(q)
            WHERE c.user_id = :userId
              AND m.search_vector @@ tsq.q
              AND (CAST(:chatId AS bigint) IS NULL OR m.chat_id = CAST(:chatId AS bigint))
              AND (CAST(:messengerType AS varchar) IS NULL
                   OR ma.messenger_type = CAST(:messengerType AS varchar))
            ORDER BY rank_score DESC, m.timestamp DESC
            LIMIT :limit OFFSET :offset
            """, nativeQuery = true)
    List<Object[]> search(@Param("userId") Long userId,
                          @Param("tsquery") String tsquery,
                          @Param("chatId") Long chatId,
                          @Param("messengerType") String messengerType,
                          @Param("limit") int limit,
                          @Param("offset") int offset);

    /** Total hits for the same predicate, so the client can page without guessing. */
    @Query(value = """
            SELECT count(*)
            FROM messages m
            JOIN chats c ON c.id = m.chat_id
            JOIN messenger_accounts ma ON ma.id = c.messenger_account_id
            CROSS JOIN to_tsquery('simple', :tsquery) AS tsq(q)
            WHERE c.user_id = :userId
              AND m.search_vector @@ tsq.q
              AND (CAST(:chatId AS bigint) IS NULL OR m.chat_id = CAST(:chatId AS bigint))
              AND (CAST(:messengerType AS varchar) IS NULL
                   OR ma.messenger_type = CAST(:messengerType AS varchar))
            """, nativeQuery = true)
    long countSearchHits(@Param("userId") Long userId,
                         @Param("tsquery") String tsquery,
                         @Param("chatId") Long chatId,
                         @Param("messengerType") String messengerType);
}
