package com.vitalii.messenger_hub_backend.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ConnectTelegramRequest {

    @NotBlank(message = "Phone number is required")
    private String phoneNumber;

    private String firstName;
    private String lastName;
}