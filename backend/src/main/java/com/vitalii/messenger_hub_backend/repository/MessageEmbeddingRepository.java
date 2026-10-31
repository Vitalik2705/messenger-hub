package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.MessageEmbedding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MessageEmbeddingRepository extends JpaRepository<MessageEmbedding, Long> {

    List<MessageEmbedding> findByUserIdAndModel(Long userId, String model);

    long countByUserIdAndModel(Long userId, String model);

    /** Everything indexed after a point, so the in-memory index can be topped up rather than rebuilt. */
    @Query("select e from MessageEmbedding e where e.userId = :userId and e.model = :model and e.id > :afterId")
    List<MessageEmbedding> findNewer(@Param("userId") Long userId,
                                     @Param("model") String model,
                                     @Param("afterId") Long afterId);

    /**
     * Messages of one user that still have no vector for this model.
     *
     * Short texts are skipped outright: "ок" and "+" carry no meaning to embed, and they
     * are a large share of any real archive.
     */
    @Query(value = """
            SELECT m.id, coalesce(m.text, m.transcript), m.chat_id
            FROM messages m
            JOIN chats c ON c.id = m.chat_id
            WHERE c.user_id = :userId
              AND coalesce(m.text, m.transcript) IS NOT NULL
              AND length(coalesce(m.text, m.transcript)) >= :minChars
              AND NOT EXISTS (
                  SELECT 1 FROM message_embeddings e
                  WHERE e.message_id = m.id AND e.model = :model)
            ORDER BY m.timestamp DESC
            LIMIT :batchSize
            """, nativeQuery = true)
    List<Object[]> findUnindexed(@Param("userId") Long userId,
                                 @Param("model") String model,
                                 @Param("minChars") int minChars,
                                 @Param("batchSize") int batchSize);

    /** Users that still have anything to index, so the job skips those that are done. */
    @Query(value = """
            SELECT DISTINCT c.user_id
            FROM messages m
            JOIN chats c ON c.id = m.chat_id
            WHERE coalesce(m.text, m.transcript) IS NOT NULL
              AND length(coalesce(m.text, m.transcript)) >= :minChars
              AND NOT EXISTS (
                  SELECT 1 FROM message_embeddings e
                  WHERE e.message_id = m.id AND e.model = :model)
            LIMIT 20
            """, nativeQuery = true)
    List<Long> findUsersWithBacklog(@Param("model") String model, @Param("minChars") int minChars);

    @Modifying
    @Query("delete from MessageEmbedding e where e.model <> :model")
    int deleteOtherModels(@Param("model") String model);
}
