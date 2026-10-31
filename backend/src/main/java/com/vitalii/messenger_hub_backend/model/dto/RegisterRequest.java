package com.vitalii.messenger_hub_backend.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {

    @NotBlank(message = "Введіть електронну пошту")
    @Email(message = "Некоректна електронна пошта")
    private String email;

    @NotBlank(message = "Введіть пароль")
    @Size(min = 8, max = 128, message = "Пароль має містити від 8 до 128 символів")
    private String password;

    @NotBlank(message = "Підтвердіть пароль")
    private String confirmPassword;

    @Size(max = 60, message = "Ім'я — до 60 символів")
    private String firstName;

    @Size(max = 60, message = "Прізвище — до 60 символів")
    private String lastName;
}
