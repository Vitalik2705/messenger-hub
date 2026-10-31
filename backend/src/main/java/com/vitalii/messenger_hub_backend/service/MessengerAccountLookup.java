package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.repository.MessengerAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Finds the owner of a messenger account by id, for background jobs that have no logged-in user,
 * without touching lazy relations outside a session.
 */
@Service
@RequiredArgsConstructor
public class MessengerAccountLookup {

    private final MessengerAccountRepository accountRepository;

    @Transactional(readOnly = true)
    public Long ownerOf(Long accountId) {
        return accountRepository.findById(accountId)
                .map(account -> account.getUser().getId())
                .orElse(null);
    }
}
