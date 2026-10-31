package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.ContactDTO;
import com.vitalii.messenger_hub_backend.model.dto.ContactIdentityDTO;
import com.vitalii.messenger_hub_backend.model.dto.ContactLinkSuggestionDTO;
import com.vitalii.messenger_hub_backend.model.entity.Contact;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.ContactLinkService;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Cross-messenger contacts. Every lookup is scoped to the authenticated user. */
@RestController
@RequestMapping("/api/contacts")
@RequiredArgsConstructor
public class ContactController {

    private final ContactLinkService contactLinkService;
    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<ContactDTO>> contacts(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(contactLinkService.listContacts(userId(principal)));
    }

    @GetMapping("/identities")
    public ResponseEntity<List<ContactIdentityDTO>> identities(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(contactLinkService.listIdentities(userId(principal)));
    }

    @GetMapping("/suggestions")
    public ResponseEntity<List<ContactLinkSuggestionDTO>> suggestions(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(contactLinkService.listPendingSuggestions(userId(principal)));
    }

    /** Re-reads the chat list and looks for new matches. Safe to call repeatedly. */
    @PostMapping("/rescan")
    public ResponseEntity<ContactLinkService.RescanResult> rescan(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(contactLinkService.rescan(userId(principal)));
    }

    @PostMapping("/suggestions/{id}/confirm")
    public ResponseEntity<?> confirm(@AuthenticationPrincipal UserDetails principal,
                                     @PathVariable Long id) {
        try {
            Contact contact = contactLinkService.confirm(userId(principal), id);
            return ResponseEntity.ok(Map.of("contactId", contact.getId()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/suggestions/{id}/reject")
    public ResponseEntity<?> reject(@AuthenticationPrincipal UserDetails principal,
                                    @PathVariable Long id) {
        try {
            contactLinkService.reject(userId(principal), id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** The "this is the same person" action, for pairs the matcher did not find. */
    @PostMapping("/link")
    public ResponseEntity<?> link(@AuthenticationPrincipal UserDetails principal,
                                  @RequestBody Map<String, Long> body) {
        Long identityAId = body.get("identityAId");
        Long identityBId = body.get("identityBId");
        if (identityAId == null || identityBId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Потрібні обидва контакти"));
        }
        try {
            Contact contact = contactLinkService.linkManually(userId(principal), identityAId, identityBId);
            return ResponseEntity.ok(Map.of("contactId", contact.getId()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/identities/{id}/unlink")
    public ResponseEntity<?> unlink(@AuthenticationPrincipal UserDetails principal,
                                    @PathVariable Long id) {
        try {
            contactLinkService.unlink(userId(principal), id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> rename(@AuthenticationPrincipal UserDetails principal,
                                    @PathVariable Long id,
                                    @RequestBody Map<String, String> body) {
        String displayName = body.get("displayName");
        if (displayName == null || displayName.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Ім'я не може бути порожнім"));
        }
        try {
            Contact contact = contactLinkService.rename(userId(principal), id, displayName.trim());
            return ResponseEntity.ok(Map.of("id", contact.getId(), "displayName", contact.getDisplayName()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private Long userId(UserDetails principal) {
        User user = userService.findByEmail(principal.getUsername());
        return user.getId();
    }
}
