package com.vitalii.messenger_hub_backend.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class DeleteAccountRequest {

    @NotBlank(message = "Введіть пароль, щоб підтвердити видалення")
    private String password;
}
