package com.vitalii.messenger_hub_backend.security;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limits failed sign-ins over a sliding 15-minute window: 5 per address and account (stops guessing
 * one password), 20 per address (stops walking through accounts). Keyed on the address too, so
 * nobody can lock the owner out from elsewhere.
 *
 * In memory: a single backend instance, and losing the counts on restart is harmless.
 */
@Component
public class LoginThrottle {

    static final int PER_ACCOUNT = 5;
    static final int PER_ADDRESS = 20;
    static final Duration WINDOW = Duration.ofMinutes(15);

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();
    private final Clock clock;

    public LoginThrottle() {
        this(Clock.systemUTC());
    }

    LoginThrottle(Clock clock) {
        this.clock = clock;
    }

    /** How long this address must wait before trying this account again; zero if it need not. */
    public Duration retryAfter(String address, String email) {
        Duration account = wait(accountKey(address, email), PER_ACCOUNT);
        Duration overall = wait(addressKey(address), PER_ADDRESS);
        return account.compareTo(overall) >= 0 ? account : overall;
    }

    public void failed(String address, String email) {
        Instant now = clock.instant();
        for (String key : new String[]{accountKey(address, email), addressKey(address)}) {
            Deque<Instant> times = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
            synchronized (times) {
                times.addLast(now);
            }
        }
    }

    /** A success clears this account's count; the address-wide one keeps running. */
    public void succeeded(String address, String email) {
        failures.remove(accountKey(address, email));
    }

    private Duration wait(String key, int limit) {
        Deque<Instant> times = failures.get(key);
        if (times == null) return Duration.ZERO;
        synchronized (times) {
            Instant horizon = clock.instant().minus(WINDOW);
            while (!times.isEmpty() && times.peekFirst().isBefore(horizon)) times.pollFirst();
            if (times.size() < limit) return Duration.ZERO;
            // Free again once enough of the oldest failures fall out of the window.
            Instant freeAt = times.stream().skip(times.size() - limit).findFirst().orElseThrow().plus(WINDOW);
            return Duration.between(clock.instant(), freeAt);
        }
    }

    /** Drops counts that have aged out entirely, so the map does not grow without bound. */
    @Scheduled(fixedDelay = 15 * 60 * 1000)
    void forgetOld() {
        Instant horizon = clock.instant().minus(WINDOW);
        failures.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || e.getValue().peekLast().isBefore(horizon);
            }
        });
    }

    private static String accountKey(String address, String email) {
        return address + "|" + email.trim().toLowerCase();
    }

    private static String addressKey(String address) {
        return address;
    }
}
