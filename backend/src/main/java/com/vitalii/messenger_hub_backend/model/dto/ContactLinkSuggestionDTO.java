package com.vitalii.messenger_hub_backend.model.dto;

import com.vitalii.messenger_hub_backend.model.enums.ContactLinkStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A proposal that two accounts belong to the same person, for the user to judge. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContactLinkSuggestionDTO {
    private Long id;
    private ContactIdentityDTO identityA;
    private ContactIdentityDTO identityB;
    private Double score;
    /** Why it was proposed — shown so the user can judge rather than trust. */
    private String reasons;
    private ContactLinkStatus status;
    private LocalDateTime createdAt;
}
