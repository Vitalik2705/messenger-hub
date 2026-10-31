package com.vitalii.messenger_hub_backend.repository;

import com.vitalii.messenger_hub_backend.model.entity.Contact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContactRepository extends JpaRepository<Contact, Long> {

    List<Contact> findByUserIdOrderByDisplayNameAsc(Long userId);

    Optional<Contact> findByIdAndUserId(Long id, Long userId);
}
