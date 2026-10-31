package com.vitalii.messenger_hub_backend.controller;

import com.vitalii.messenger_hub_backend.model.dto.MessageDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Pushes messages to a single authenticated user.
 *
 * Destinations are per-user rather than a global topic keyed by user id: the previous
 * /topic/user/{userId}/messages scheme let any connected client subscribe to another
 * user's stream simply by changing the number.
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
