package com.vitalii.messenger_hub_backend.model.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateProfileRequest {

    @Size(max = 60, message = "Ім'я — до 60 символів")
    private String firstName;

    @Size(max = 60, message = "Прізвище — до 60 символів")
    private String lastName;
}
