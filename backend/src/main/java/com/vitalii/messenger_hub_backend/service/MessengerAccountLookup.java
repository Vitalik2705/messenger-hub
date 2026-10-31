package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.repository.MessengerAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who owns a messenger account.
 *
 * A tiny service of its own because background jobs work from ids rather than from a
 * logged-in user, and every messenger call still needs the owner to authorise itself. The
 * alternative is each job reaching into the repository and navigating a lazy relation
 * outside a session, which is the bug this exists to avoid.
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
