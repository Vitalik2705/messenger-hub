package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.Chat;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChatRepository extends JpaRepository<Chat, Long> {

    List<Chat> findByUserIdOrderByLastMessageAtDesc(Long userId);

    List<Chat> findByMessengerAccountIdOrderByLastMessageAtDesc(Long messengerAccountId);

    Optional<Chat> findByMessengerAccountIdAndExternalChatId(Long messengerAccountId, String externalChatId);

    List<Chat> findAllByMessengerAccountId(Long messengerAccountId);
}