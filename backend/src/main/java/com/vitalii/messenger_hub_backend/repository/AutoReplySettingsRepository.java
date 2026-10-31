package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.AutoReplySettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AutoReplySettingsRepository extends JpaRepository<AutoReplySettings, Long> {
    Optional<AutoReplySettings> findByUserId(Long userId);
}
