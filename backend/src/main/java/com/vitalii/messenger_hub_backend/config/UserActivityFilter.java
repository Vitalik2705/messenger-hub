package com.vitalii.messenger_hub_backend.config;

import com.vitalii.messenger_hub_backend.service.BackgroundWorkGate;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Records user activity for every route, so background jobs can stand aside. */
@Component
@RequiredArgsConstructor
@Order(1)
public class UserActivityFilter extends OncePerRequestFilter {

    private final BackgroundWorkGate gate;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        // Status polls and requests the client marks as background (timers) are not activity;
        // counting them would keep an idle open tab "active" forever.
        boolean background = "1".equals(request.getHeader("X-Background"));
        if (path.startsWith("/api/") && !path.contains("/status") && !background) {
            gate.markUserActivity();
        }
        chain.doFilter(request, response);
    }
}
