package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.exception.CustomException;
import com.vitalii.messenger_hub_backend.model.dto.AuthResponse;
import com.vitalii.messenger_hub_backend.model.dto.ChangePasswordRequest;
import com.vitalii.messenger_hub_backend.model.dto.DeleteAccountRequest;
import com.vitalii.messenger_hub_backend.model.dto.UpdateProfileRequest;
import com.vitalii.messenger_hub_backend.model.dto.UserDTO;
import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.AuthService;
import com.vitalii.messenger_hub_backend.service.UserAccountService;
import com.vitalii.messenger_hub_backend.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The signed-in user's own account. Everything is under /me; no endpoint reads another user by id.
 */
@RestController
@RequestMapping("/api/users/me")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserAccountService userAccountService;
    private final AuthService authService;

    @GetMapping
    public ResponseEntity<UserDTO> getCurrentUser(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(userService.convertToDTO(current(principal)));
    }

    @PutMapping
    public ResponseEntity<UserDTO> updateProfile(@AuthenticationPrincipal UserDetails principal,
                                                 @Valid @RequestBody UpdateProfileRequest request) {
        User user = userService.updateProfile(current(principal), request);
        return ResponseEntity.ok(userService.convertToDTO(user));
    }

    /** Returns new tokens: the old ones, this session's included, stop working. */
    @PostMapping("/password")
    public ResponseEntity<AuthResponse> changePassword(@AuthenticationPrincipal UserDetails principal,
                                                       @Valid @RequestBody ChangePasswordRequest request) {
        User user = current(principal);
        userService.changePassword(user, request);
        return ResponseEntity.ok(authService.issueTokens(user));
    }

    /** "Sign out everywhere else": every other session ends, this one continues on new tokens. */
    @PostMapping("/sessions/end-others")
    public ResponseEntity<AuthResponse> endOtherSessions(@AuthenticationPrincipal UserDetails principal) {
        User user = current(principal);
        userService.endAllSessions(user);
        return ResponseEntity.ok(authService.issueTokens(user));
    }

    /** Connected accounts and how much of the user's correspondence is stored. */
    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> overview(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(userAccountService.overview(current(principal)));
    }

    /** Irreversible, so it asks for the password again rather than trusting the token. */
    @DeleteMapping
    public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal UserDetails principal,
                                              @Valid @RequestBody DeleteAccountRequest request) {
        User user = current(principal);
        if (!userService.passwordMatches(user, request.getPassword())) {
            throw new CustomException("Пароль невірний", HttpStatus.BAD_REQUEST);
        }
        userAccountService.deleteEverything(user);
        return ResponseEntity.noContent().build();
    }

    private User current(UserDetails principal) {
        return userService.findByEmail(principal.getUsername());
    }
}
