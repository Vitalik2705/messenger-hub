package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.service.TelegramService;
import com.vitalii.messenger_hub_backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/telegram/auth")
@RequiredArgsConstructor
public class TelegramAuthController {

    private final TelegramService telegramService;
    private final UserService userService;

    @PostMapping("/send-code")
    public ResponseEntity<Map<String, Object>> sendCode(
            @RequestBody Map<String, String> request) {
        Map<String, Object> result = telegramService.sendCode(request.get("phone"));
        return ResponseEntity.ok(result);
    }

    @PostMapping("/qr-start")
    public ResponseEntity<Map<String, Object>> qrStart() {
        return ResponseEntity.ok(telegramService.qrStart());
    }

    @GetMapping("/qr-status")
    public ResponseEntity<Map<String, Object>> qrStatus(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam String loginId) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.qrStatus(user.getId(), loginId));
    }

    @PostMapping("/qr-password")
    public ResponseEntity<Map<String, Object>> qrPassword(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request) {
        User user = userService.findByEmail(userDetails.getUsername());
        return ResponseEntity.ok(telegramService.qrPassword(
                user.getId(), request.get("login_id"), request.get("password")));
    }

    @PostMapping("/resend-code")
    public ResponseEntity<Map<String, Object>> resendCode(
            @RequestBody Map<String, String> request) {
        return ResponseEntity.ok(telegramService.resendCode(
                request.get("phone"), request.get("phone_code_hash")));
    }

    @PostMapping("/sign-in")
    public ResponseEntity<Map<String, Object>> signIn(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request) {
        User user = userService.findByEmail(userDetails.getUsername());
        Map<String, Object> result = telegramService.signIn(
                user.getId(),
                request.get("phone"),
                request.get("code"),
                request.get("phone_code_hash"),
                request.get("session")
        );
        return ResponseEntity.ok(result);
    }

    @PostMapping("/sign-in-password")
    public ResponseEntity<Map<String, Object>> signInPassword(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody Map<String, String> request) {
        User user = userService.findByEmail(userDetails.getUsername());
        Map<String, Object> result = telegramService.signInPassword(
                user.getId(),
                request.get("phone"),
                request.get("password"),
                request.get("session")
        );
        return ResponseEntity.ok(result);
    }
}