package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.model.dto.ContactDTO;
import com.vitalii.messenger_hub_backend.model.dto.ContactIdentityDTO;
import com.vitalii.messenger_hub_backend.model.dto.ContactLinkSuggestionDTO;
import com.vitalii.messenger_hub_backend.model.entity.*;
import com.vitalii.messenger_hub_backend.model.enums.ChatKind;
import com.vitalii.messenger_hub_backend.model.enums.ContactLinkStatus;
import com.vitalii.messenger_hub_backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Recognises that two accounts in different messengers belong to the same person.
 *
 * No link is ever created without the user saying so. The matcher only proposes; a wrong
 * merge is much more costly than a missed one, and nothing here has evidence strong enough
 * to justify acting alone.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ContactLinkService {

    private final ChatRepository chatRepository;
    private final ContactRepository contactRepository;
    private final ContactIdentityRepository identityRepository;
    private final ContactLinkSuggestionRepository suggestionRepository;
    private final UserRepository userRepository;

    public record RescanResult(int newIdentities, int newSuggestions, int totalIdentities) {
    }

    /**
     * Brings identities and proposals up to date with the chats the user actually has.
     */
    @Transactional
    public RescanResult rescan(Long userId) {
        int newIdentities = harvestIdentities(userId);
        int newSuggestions = proposeLinks(userId);
        int total = identityRepository.findByUserId(userId).size();

        log.info("Contact rescan for user {}: +{} identities, +{} suggestions, {} total",
                userId, newIdentities, newSuggestions, total);
        return new RescanResult(newIdentities, newSuggestions, total);
    }

    /**
     * Gives every personal chat an identity.
     *
     * Existing identities are left alone, including their display name. A counterpart who
     * renames themselves must not quietly rewrite the evidence behind a decision the user
     * already made.
     */
    @Transactional
    public int harvestIdentities(Long userId) {
        Set<Long> alreadyHarvested = identityRepository.findChatIdsWithIdentity(userId);
        List<Chat> chats = chatRepository.findPersonalChats(userId);

        List<ContactIdentity> fresh = new ArrayList<>();
        for (Chat chat : chats) {
            if (alreadyHarvested.contains(chat.getId())) continue;
            if (!standsForAPerson(chat)) continue;
            fresh.add(ContactIdentity.builder()
                    .user(chat.getUser())
                    .chat(chat)
                    .messengerType(chat.getMessengerAccount().getMessengerType())
                    .messengerAccountId(chat.getMessengerAccount().getId())
                    .externalChatId(chat.getExternalChatId())
                    .displayName(chat.getName())
                    .build());
        }

        if (!fresh.isEmpty()) identityRepository.saveAll(fresh);
        return fresh.size();
    }

    /**
     * Whether a chat stands for a human being.
     *
     * A one-to-one chat is not the same thing as a person: bots and the messenger's own
     * notification account are one-to-one too. Comparing their names produced perfect,
     * useless matches — "Telegram" against "Telegram" scored 1.0 across two accounts and
     * asked the user to confirm that a service chat was the same person as itself.
     *
     * A chat synced before the kind was recorded has none, and is admitted rather than
     * dropped: losing a real person is the worse error, and the next sync fills it in.
     */
    private boolean standsForAPerson(Chat chat) {
        ChatKind kind = chat.getChatKind();
        return kind == null || kind == ChatKind.PERSON;
    }

    /**
     * Compares every identity with every other and records the pairs worth asking about.
     *
     * Quadratic in the number of identities, which is fine at the scale of one person's
     * address book and keeps the comparison honest — there is no blocking key that would
     * survive transliteration and nicknames anyway.
     */
    @Transactional
    public int proposeLinks(Long userId) {
        List<ContactIdentity> identities = identityRepository.findByUserId(userId);
        if (identities.size() < 2) return 0;

        // Pairs already decided or already waiting: asking twice is worse than not asking.
        Set<String> known = new HashSet<>(suggestionRepository.findKnownPairKeys(userId));
        User user = userRepository.findById(userId).orElseThrow();

        List<ContactLinkSuggestion> proposals = new ArrayList<>();
        for (int i = 0; i < identities.size(); i++) {
            for (int j = i + 1; j < identities.size(); j++) {
                ContactIdentity a = identities.get(i);
                ContactIdentity b = identities.get(j);

                if (!worthComparing(a, b)) continue;
                if (known.contains(pairKey(a.getId(), b.getId()))) continue;

                NameSimilarity.Match match =
                        NameSimilarity.compare(a.getDisplayName(), b.getDisplayName());
                if (!match.isSuggestable()) continue;

                ContactIdentity first = a.getId() < b.getId() ? a : b;
                ContactIdentity second = first == a ? b : a;

                proposals.add(ContactLinkSuggestion.builder()
                        .user(user)
                        .identityA(first)
                        .identityB(second)
                        .score(match.score())
                        .reasons(String.join("; ", match.reasons()))
                        .status(ContactLinkStatus.PENDING)
                        .build());
                known.add(pairKey(a.getId(), b.getId()));
            }
        }

        if (!proposals.isEmpty()) suggestionRepository.saveAll(proposals);
        return proposals.size();
    }

    /**
     * Two handles on the same account are the same conversation partner list — one person
     * cannot appear twice there, so a match would be a false positive by construction.
     * Identities already grouped under one contact have nothing left to decide.
     */
    private boolean worthComparing(ContactIdentity a, ContactIdentity b) {
        if (Objects.equals(a.getMessengerAccountId(), b.getMessengerAccountId())) return false;
        return a.getContact() == null
                || b.getContact() == null
                || !Objects.equals(a.getContact().getId(), b.getContact().getId());
    }

    private String pairKey(Long idA, Long idB) {
        return idA < idB ? idA + ":" + idB : idB + ":" + idA;
    }

    // ── Decisions ─────────────────────────────────────────────────────────────

    @Transactional
    public Contact confirm(Long userId, Long suggestionId) {
        ContactLinkSuggestion suggestion = suggestionRepository.findByIdAndUserId(suggestionId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Пропозицію не знайдено"));

        Contact contact = link(suggestion.getIdentityA(), suggestion.getIdentityB());

        suggestion.setStatus(ContactLinkStatus.CONFIRMED);
        suggestion.setDecidedAt(LocalDateTime.now());
        suggestionRepository.save(suggestion);
        return contact;
    }

    @Transactional
    public void reject(Long userId, Long suggestionId) {
        ContactLinkSuggestion suggestion = suggestionRepository.findByIdAndUserId(suggestionId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Пропозицію не знайдено"));

        suggestion.setStatus(ContactLinkStatus.REJECTED);
        suggestion.setDecidedAt(LocalDateTime.now());
        suggestionRepository.save(suggestion);
    }

    /**
     * The "this is the same person" button: links two identities the matcher never proposed.
     *
     * The decision is also written down as a confirmed suggestion, so a later rescan treats
     * the pair as settled instead of offering it again.
     */
    @Transactional
    public Contact linkManually(Long userId, Long identityAId, Long identityBId) {
        if (Objects.equals(identityAId, identityBId)) {
            throw new IllegalArgumentException("Не можна зв'язати контакт із самим собою");
        }

        ContactIdentity a = requireIdentity(userId, identityAId);
        ContactIdentity b = requireIdentity(userId, identityBId);

        if (Objects.equals(a.getMessengerAccountId(), b.getMessengerAccountId())) {
            throw new IllegalArgumentException("Обидва чати належать одному акаунту");
        }

        Contact contact = link(a, b);
        recordDecision(a, b, ContactLinkStatus.CONFIRMED);
        return contact;
    }

    /**
     * Removes an identity from its contact.
     *
     * A contact left with a single identity is dissolved: it no longer records a link
     * between anything, and leaving it would show the user a "merged person" made of one
     * account. Any confirmation behind the removed link becomes a rejection, so the matcher
     * does not propose what the user has just undone.
     */
    @Transactional
    public void unlink(Long userId, Long identityId) {
        ContactIdentity identity = requireIdentity(userId, identityId);
        Contact contact = identity.getContact();
        if (contact == null) return;

        identity.setContact(null);
        identityRepository.saveAndFlush(identity);

        for (ContactLinkSuggestion suggestion : suggestionRepository.findInvolving(userId, identityId)) {
            if (suggestion.getStatus() == ContactLinkStatus.CONFIRMED) {
                suggestion.setStatus(ContactLinkStatus.REJECTED);
                suggestion.setDecidedAt(LocalDateTime.now());
                suggestionRepository.save(suggestion);
            }
        }

        List<ContactIdentity> remaining = identityRepository.findByContactId(contact.getId());
        if (remaining.size() <= 1) {
            for (ContactIdentity orphan : remaining) orphan.setContact(null);
            identityRepository.saveAll(remaining);
            identityRepository.flush();
            contactRepository.delete(contact);
        }
    }

    @Transactional
    public Contact rename(Long userId, Long contactId, String displayName) {
        Contact contact = contactRepository.findByIdAndUserId(contactId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Контакт не знайдено"));
        contact.setDisplayName(displayName);
        return contactRepository.save(contact);
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ContactDTO> listContacts(Long userId) {
        List<ContactDTO> contacts = new ArrayList<>();
        for (Contact contact : contactRepository.findByUserIdOrderByDisplayNameAsc(userId)) {
            contacts.add(ContactDTO.builder()
                    .id(contact.getId())
                    .displayName(contact.getDisplayName())
                    .identities(identityRepository.findByContactId(contact.getId()).stream()
                            .map(this::toDto)
                            .toList())
                    .build());
        }
        return contacts;
    }

    /** Every harvested handle, linked or not — the pool the "same person" button picks from. */
    @Transactional(readOnly = true)
    public List<ContactIdentityDTO> listIdentities(Long userId) {
        return identityRepository.findByUserId(userId).stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<ContactLinkSuggestionDTO> listPendingSuggestions(Long userId) {
        return suggestionRepository
                .findByUserIdAndStatusOrderByScoreDesc(userId, ContactLinkStatus.PENDING)
                .stream()
                .map(suggestion -> ContactLinkSuggestionDTO.builder()
                        .id(suggestion.getId())
                        .identityA(toDto(suggestion.getIdentityA()))
                        .identityB(toDto(suggestion.getIdentityB()))
                        .score(suggestion.getScore())
                        .reasons(suggestion.getReasons())
                        .status(suggestion.getStatus())
                        .createdAt(suggestion.getCreatedAt())
                        .build())
                .toList();
    }

    private ContactIdentityDTO toDto(ContactIdentity identity) {
        return ContactIdentityDTO.builder()
                .id(identity.getId())
                .chatId(identity.getChat().getId())
                .messengerType(identity.getMessengerType())
                .messengerAccountId(identity.getMessengerAccountId())
                .externalChatId(identity.getExternalChatId())
                .displayName(identity.getDisplayName())
                .contactId(identity.getContact() == null ? null : identity.getContact().getId())
                .build();
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    /**
     * Puts two identities under one contact, whatever state they start in.
     *
     * When both already belong to contacts, the two are merged rather than one being
     * discarded — otherwise confirming "A is B" would silently drop everything previously
     * linked to B.
     */
    private Contact link(ContactIdentity a, ContactIdentity b) {
        Contact contactA = a.getContact();
        Contact contactB = b.getContact();

        if (contactA == null && contactB == null) {
            Contact created = contactRepository.save(Contact.builder()
                    .user(a.getUser())
                    .displayName(preferredName(a, b))
                    .build());
            a.setContact(created);
            b.setContact(created);
            identityRepository.saveAll(List.of(a, b));
            return created;
        }

        if (contactA == null) {
            a.setContact(contactB);
            identityRepository.save(a);
            return contactB;
        }

        if (contactB == null) {
            b.setContact(contactA);
            identityRepository.save(b);
            return contactA;
        }

        if (Objects.equals(contactA.getId(), contactB.getId())) return contactA;

        List<ContactIdentity> moved = identityRepository.findByContactId(contactB.getId());
        for (ContactIdentity identity : moved) identity.setContact(contactA);
        identityRepository.saveAll(moved);
        identityRepository.flush();
        contactRepository.delete(contactB);
        return contactA;
    }

    /** The longer name is usually the fuller one — "Vitalii Yatskiv" over "Vitalii". */
    private String preferredName(ContactIdentity a, ContactIdentity b) {
        String nameA = a.getDisplayName() == null ? "" : a.getDisplayName();
        String nameB = b.getDisplayName() == null ? "" : b.getDisplayName();
        return nameA.length() >= nameB.length() ? nameA : nameB;
    }

    private void recordDecision(ContactIdentity a, ContactIdentity b, ContactLinkStatus status) {
        ContactIdentity first = a.getId() < b.getId() ? a : b;
        ContactIdentity second = first == a ? b : a;

        ContactLinkSuggestion existing = suggestionRepository
                .findByIdentityAIdAndIdentityBId(first.getId(), second.getId())
                .orElseGet(() -> ContactLinkSuggestion.builder()
                        .user(a.getUser())
                        .identityA(first)
                        .identityB(second)
                        .score(1.0)
                        .reasons("підтверджено вручну")
                        .build());

        existing.setStatus(status);
        existing.setDecidedAt(LocalDateTime.now());
        suggestionRepository.save(existing);
    }

    private ContactIdentity requireIdentity(Long userId, Long identityId) {
        return identityRepository.findByIdAndUserId(identityId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Контакт не знайдено"));
    }
}
