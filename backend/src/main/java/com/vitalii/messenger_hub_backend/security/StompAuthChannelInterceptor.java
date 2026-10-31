package com.vitalii.messenger_hub_backend.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Authenticates STOMP clients on CONNECT with their JWT; without a valid token the connection is
 * rejected. The attached principal is what routes /user/queue/** to that user only.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final String AUTH_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtUtil jwtUtil;
    private final CustomUserDetailsService userDetailsService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
            // Only CONNECT carries credentials; later frames ride the session's principal.
            return message;
        }

        String authHeader = accessor.getFirstNativeHeader(AUTH_HEADER);
        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            throw new MessagingException("Missing authentication token");
        }

        String token = authHeader.substring(BEARER_PREFIX.length());
        try {
            String email = jwtUtil.extractEmail(token);
            AppUserDetails userDetails = userDetailsService.loadUserByUsername(email);

            if (!jwtUtil.validateToken(token, userDetails)) {
                throw new MessagingException("Invalid authentication token");
            }

            accessor.setUser(new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities()));
            log.debug("WebSocket authenticated: {}", email);
        } catch (MessagingException e) {
            throw e;
        } catch (Exception e) {
            // Expired, malformed, wrong signature, unknown user — all equally unauthorised.
            // The client only sees the generic message; the cause stays server-side.
            throw new MessagingException("Invalid authentication token", e);
        }

        return message;
    }
}
