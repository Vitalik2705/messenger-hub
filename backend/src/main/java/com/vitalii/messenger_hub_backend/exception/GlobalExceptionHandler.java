package com.vitalii.messenger_hub_backend.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(CustomException.class)
    public ResponseEntity<ErrorResponse> handleCustomException(
            CustomException ex,
            HttpServletRequest request) {

        ErrorResponse error = new ErrorResponse(
                ex.getStatus().value(),
                ex.getMessage(),
                LocalDateTime.now(),
                request.getRequestURI()
        );

        return new ResponseEntity<>(error, ex.getStatus());
    }

    /**
     * Validation errors keyed by field for the form, with the first one also in "message" like
     * every other API error.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidationExceptions(
            MethodArgumentNotValidException ex) {

        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(error -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", HttpStatus.BAD_REQUEST.value());
        body.put("message", fields.isEmpty() ? "Некоректні дані" : fields.values().iterator().next());
        body.put("fields", fields);
        return new ResponseEntity<>(body, HttpStatus.BAD_REQUEST);
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * A messenger service refused the request (wrong 2FA password, flood wait, expired login); its
     * own message is passed on.
     *
     * Upstream 401/403 become 502: they reject the messenger session, not the user's token, and
     * must not log the user out.
     */
    @ExceptionHandler(RestClientResponseException.class)
    public ResponseEntity<ErrorResponse> handleUpstreamError(
            RestClientResponseException ex,
            HttpServletRequest request) {

        int upstream = ex.getStatusCode().value();
        HttpStatus status = upstream >= 400 && upstream < 500 && upstream != 401 && upstream != 403
                ? HttpStatus.valueOf(upstream)
                : HttpStatus.BAD_GATEWAY;

        ErrorResponse error = new ErrorResponse(
                status.value(),
                upstreamMessage(ex),
                LocalDateTime.now(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(error, status);
    }

    /** FastAPI services answer {"detail": ...}, the Node one {"error": ...}. */
    private static String upstreamMessage(RestClientResponseException ex) {
        try {
            JsonNode body = JSON.readTree(ex.getResponseBodyAsString());
            for (String field : new String[]{"detail", "error", "message"}) {
                if (body.path(field).isTextual()) return body.path(field).asText();
            }
        } catch (Exception ignored) {
            // Not JSON — fall through to the generic text.
        }
        return "Сервіс месенджера відхилив запит (" + ex.getStatusCode().value() + ")";
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGlobalException(
            Exception ex,
            HttpServletRequest request) {

        ErrorResponse error = new ErrorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "An unexpected error occurred",
                LocalDateTime.now(),
                request.getRequestURI()
        );

        return new ResponseEntity<>(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}