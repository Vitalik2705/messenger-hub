package com.vitalii.messenger_hub_backend.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** A person together with every account the user has linked to them. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContactDTO {
    private Long id;
    private String displayName;
    private List<ContactIdentityDTO> identities;
}
