package com.vitalii.messenger_hub_backend.security;

import com.vitalii.messenger_hub_backend.model.entity.User;
import com.vitalii.messenger_hub_backend.model.enums.UserRole;
import com.vitalii.messenger_hub_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StompAuthChannelInterceptorTest {

    private static final String SECRET =
            "test-secret-key-that-is-long-enough-for-hs256-signing-000000";
    private static final String EMAIL = "user@example.com";

    private JwtUtil jwtUtil;
    private StompAuthChannelInterceptor interceptor;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret", SECRET);
        ReflectionTestUtils.setField(jwtUtil, "expiration", 900_000L);
        ReflectionTestUtils.setField(jwtUtil, "refreshExpiration", 604_800_000L);

        User user = User.builder()
                .id(1L)
                .email(EMAIL)
                .passwordHash("hash")
                .role(UserRole.USER)
                .isActive(true)
                .build();

        UserRepository userRepository = mock(UserRepository.class);
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));

        interceptor = new StompAuthChannelInterceptor(
                jwtUtil, new CustomUserDetailsService(userRepository));
    }

    /**
     * Mirrors how Spring builds an inbound client frame: the accessor is left mutable so
     * a channel interceptor can attach the authenticated principal.
     */
    private Message<byte[]> connectFrame(String authHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setLeaveMutable(true);
        if (authHeader != null) accessor.addNativeHeader("Authorization", authHeader);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    void attachesPrincipalForAValidToken() {
        String token = jwtUtil.generateAccessToken(EMAIL, 1L);

        Message<?> result = interceptor.preSend(connectFrame("Bearer " + token), null);

        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(result);
        assertNotNull(accessor.getUser(), "an authenticated CONNECT must carry a principal");
        assertEquals(EMAIL, accessor.getUser().getName());
    }

    @Test
    void rejectsAConnectWithoutAToken() {
        assertThrows(MessagingException.class,
                () -> interceptor.preSend(connectFrame(null), null));
    }

    @Test
    void rejectsAMalformedToken() {
        assertThrows(MessagingException.class,
                () -> interceptor.preSend(connectFrame("Bearer not-a-jwt"), null));
    }

    @Test
    void rejectsATokenSignedWithAnotherKey() {
        JwtUtil foreign = new JwtUtil();
        ReflectionTestUtils.setField(foreign, "secret",
                "a-completely-different-secret-key-of-sufficient-length-11");
        ReflectionTestUtils.setField(foreign, "expiration", 900_000L);
        ReflectionTestUtils.setField(foreign, "refreshExpiration", 604_800_000L);

        String forged = foreign.generateAccessToken(EMAIL, 1L);

        assertThrows(MessagingException.class,
                () -> interceptor.preSend(connectFrame("Bearer " + forged), null));
    }

    @Test
    void rejectsAnExpiredToken() {
        ReflectionTestUtils.setField(jwtUtil, "expiration", -1_000L);
        String expired = jwtUtil.generateAccessToken(EMAIL, 1L);

        assertThrows(MessagingException.class,
                () -> interceptor.preSend(connectFrame("Bearer " + expired), null));
    }

    @Test
    void rejectsATokenForAnUnknownUser() {
        String token = jwtUtil.generateAccessToken("ghost@example.com", 99L);

        assertThrows(MessagingException.class,
                () -> interceptor.preSend(connectFrame("Bearer " + token), null));
    }

    @Test
    void leavesNonConnectFramesUntouched() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setLeaveMutable(true);
        Message<byte[]> send = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        assertSame(send, interceptor.preSend(send, null));
    }
}
