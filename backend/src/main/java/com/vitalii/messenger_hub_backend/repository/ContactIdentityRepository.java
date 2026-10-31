package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.ContactIdentity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.Set;

@Repository
public interface ContactIdentityRepository extends JpaRepository<ContactIdentity, Long> {

    Optional<ContactIdentity> findByIdAndUserId(Long id, Long userId);

    Optional<ContactIdentity> findByChatId(Long chatId);

    List<ContactIdentity> findByUserId(Long userId);

    List<ContactIdentity> findByContactId(Long contactId);

    /** Which chats already have an identity, so harvesting can skip them in one query. */
    @Query("select i.chat.id from ContactIdentity i where i.user.id = :userId")
    Set<Long> findChatIdsWithIdentity(@Param("userId") Long userId);

    long countByContactId(Long contactId);
}
