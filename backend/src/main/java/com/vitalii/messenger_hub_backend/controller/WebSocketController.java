package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Pushes messages to one authenticated user through a per-user destination, so no client can
 * subscribe to another user's stream.
 */
@Controller
@RequiredArgsConstructor
@Slf4j
public class WebSocketController {

    /** Clients subscribe to /user/queue/messages; Spring prefixes it per principal. */
    public static final String USER_MESSAGES_DESTINATION = "/queue/messages";

    private final SimpMessagingTemplate messagingTemplate;

    public void notifyNewMessage(String userEmail, MessageDTO message) {
        messagingTemplate.convertAndSendToUser(userEmail, USER_MESSAGES_DESTINATION, message);
    }
}
