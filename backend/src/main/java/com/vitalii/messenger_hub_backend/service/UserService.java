package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.dto.ChangePasswordRequest;
import com.vitalii.messenger_hub_backend.model.dto.UpdateProfileRequest;
import com.vitalii.messenger_hub_backend.model.dto.UserDTO;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public User findByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException("User not found", HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public User findById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new CustomException("User not found", HttpStatus.NOT_FOUND));
    }

    /** Addresses are compared without case: "Name@Mail.com" and "name@mail.com" are one inbox. */
    @Transactional(readOnly = true)
    public Optional<User> findOptionalByEmail(String email) {
        return userRepository.findByEmailIgnoreCase(email);
    }

    @Transactional(readOnly = true)
    public boolean existsByEmail(String email) {
        return userRepository.existsByEmailIgnoreCase(email);
    }

    @Transactional
    public User updateProfile(User user, UpdateProfileRequest request) {
        if (request.getFirstName() != null) user.setFirstName(blankToNull(request.getFirstName()));
        if (request.getLastName() != null) user.setLastName(blankToNull(request.getLastName()));
        return userRepository.save(user);
    }

    /**
     * Requires the current password even with a valid token. Every token issued before the change
     * stops working; the controller issues the caller a new pair.
     */
    @Transactional
    public void changePassword(User user, ChangePasswordRequest request) {
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new CustomException("Поточний пароль невірний", HttpStatus.BAD_REQUEST);
        }
        if (passwordEncoder.matches(request.getNewPassword(), user.getPasswordHash())) {
            throw new CustomException("Новий пароль збігається з поточним", HttpStatus.BAD_REQUEST);
        }
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setCredentialsChangedAt(Instant.now());
        userRepository.save(user);
    }

    /** Ends every session of this user; the caller gets a new pair from the controller. */
    @Transactional
    public void endAllSessions(User user) {
        user.setCredentialsChangedAt(Instant.now());
        userRepository.save(user);
    }

    public boolean passwordMatches(User user, String password) {
        return password != null && passwordEncoder.matches(password, user.getPasswordHash());
    }

    @Transactional
    public User save(User user) {
        return userRepository.save(user);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public UserDTO convertToDTO(User user) {
        return UserDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .isActive(user.getIsActive())
                .createdAt(user.getCreatedAt())
                .build();
    }
}