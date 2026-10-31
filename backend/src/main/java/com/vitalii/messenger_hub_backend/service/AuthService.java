package com.vitalii.messenger_hub_backend.service;

import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.dto.AuthResponse;
import com.vitalii.messenger_hub_backend.model.dto.LoginRequest;
import com.vitalii.messenger_hub_backend.model.dto.RegisterRequest;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.model.enums.UserRole;
import com.vitalii.messenger_hub_backend.security.JwtUtil;
import com.vitalii.messenger_hub_backend.security.LoginThrottle;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final LoginThrottle loginThrottle;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (!request.getPassword().equals(request.getConfirmPassword())) {
            throw new CustomException("Паролі не збігаються", HttpStatus.BAD_REQUEST);
        }

        String email = request.getEmail().trim().toLowerCase();
        if (userService.existsByEmail(email)) {
            throw new CustomException("Акаунт з такою поштою вже існує", HttpStatus.CONFLICT);
        }

        User user = userService.save(User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .firstName(blankToNull(request.getFirstName()))
                .lastName(blankToNull(request.getLastName()))
                .isActive(true)
                .role(UserRole.USER)
                .build());

        log.info("User registered: id={}", user.getId());
        return tokensFor(user, jwtUtil.generateRefreshToken(user.getEmail()));
    }

    /**
     * Unknown email and wrong password get the same answer, so nobody can probe which addresses
     * have accounts. Failed attempts are throttled.
     */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request, String address) {
        String email = request.getEmail().trim().toLowerCase();
        Duration wait = loginThrottle.retryAfter(address, email);
        if (!wait.isZero()) {
            long minutes = Math.max(1, (wait.toSeconds() + 59) / 60);
            throw new CustomException("Забагато невдалих спроб входу. Спробуйте через " + minutes + " хв.",
                    HttpStatus.TOO_MANY_REQUESTS);
        }

        User user = userService.findOptionalByEmail(email)
                .filter(u -> passwordEncoder.matches(request.getPassword(), u.getPasswordHash()))
                .orElse(null);
        if (user == null) {
            loginThrottle.failed(address, email);
            throw new CustomException("Невірна пошта або пароль", HttpStatus.UNAUTHORIZED);
        }
        loginThrottle.succeeded(address, email);

        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new CustomException("Акаунт не активовано", HttpStatus.FORBIDDEN);
        }

        log.info("User logged in: id={}", user.getId());
        return tokensFor(user, jwtUtil.generateRefreshToken(user.getEmail()));
    }

    @Transactional(readOnly = true)
    public AuthResponse refreshToken(String refreshToken) {
        try {
            String email = jwtUtil.extractEmail(refreshToken);
            User user = userService.findByEmail(email);

            if (!jwtUtil.validateToken(refreshToken, email, user.getCredentialsChangedAt())) {
                throw new CustomException("Invalid refresh token", HttpStatus.UNAUTHORIZED);
            }

            return tokensFor(user, refreshToken);

        } catch (Exception e) {
            throw new CustomException("Invalid refresh token", HttpStatus.UNAUTHORIZED);
        }
    }

    /** A fresh pair for a session that should outlive a credentials change — the one making it. */
    public AuthResponse issueTokens(User user) {
        return tokensFor(user, jwtUtil.generateRefreshToken(user.getEmail()));
    }

    private AuthResponse tokensFor(User user, String refreshToken) {
        return AuthResponse.builder()
                .accessToken(jwtUtil.generateAccessToken(user.getEmail(), user.getId()))
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(900000L) // 15 minutes
                .user(userService.convertToDTO(user))
                .build();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}