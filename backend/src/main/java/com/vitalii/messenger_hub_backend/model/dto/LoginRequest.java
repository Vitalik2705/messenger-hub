package com.vitalii.messenger_hub_backend.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoginRequest {

    @NotBlank(message = "Введіть електронну пошту")
    @Email(message = "Некоректна електронна пошта")
    private String email;

    @NotBlank(message = "Введіть пароль")
    private String password;
}
