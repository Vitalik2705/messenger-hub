package com.vitalii.messenger_hub_backend.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChangePasswordRequest {

    @NotBlank(message = "Введіть поточний пароль")
    private String currentPassword;

    @NotBlank(message = "Введіть новий пароль")
    @Size(min = 8, max = 128, message = "Пароль має містити від 8 до 128 символів")
    private String newPassword;
}
