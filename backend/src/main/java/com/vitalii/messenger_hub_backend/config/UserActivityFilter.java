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

/**
 * Records that the user is doing something, so background jobs can stand aside.
 *
 * A filter rather than a call in each controller: the signal has to cover every route,
 * including the ones added later, and a controller that forgets to report itself would
 * silently let the archiver compete with it.
 */
@Component
@RequiredArgsConstructor
@Order(1)
public class UserActivityFilter extends OncePerRequestFilter {

    private final BackgroundWorkGate gate;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        // Status polling is the client asking "are you done yet" — treating it as activity
        // would make a watched job never resume.
        if (path.startsWith("/api/") && !path.contains("/status")) {
            gate.markUserActivity();
        }
        chain.doFilter(request, response);
    }
}
