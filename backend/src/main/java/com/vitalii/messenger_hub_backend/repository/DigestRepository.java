package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.Digest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DigestRepository extends JpaRepository<Digest, Long> {
    List<Digest> findTop30ByUserIdOrderByCreatedAtDesc(Long userId);
}
