package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.MessengerAccount;
import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MessengerAccountRepository extends JpaRepository<MessengerAccount, Long> {

    List<MessengerAccount> findByUserId(Long userId);

    Optional<MessengerAccount> findByUserIdAndMessengerType(Long userId, MessengerType messengerType);

    List<MessengerAccount> findAllByUserIdAndMessengerType(Long userId, MessengerType messengerType);

    Optional<MessengerAccount> findByUserIdAndMessengerTypeAndExternalUserId(
            Long userId, MessengerType messengerType, String externalUserId);

    boolean existsByUserIdAndMessengerType(Long userId, MessengerType messengerType);

    List<MessengerAccount> findAllByMessengerTypeAndIsConnected(
            MessengerType messengerType,
            Boolean isConnected
    );
}