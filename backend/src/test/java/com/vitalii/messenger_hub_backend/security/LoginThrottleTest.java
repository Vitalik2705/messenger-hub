package com.vitalii.messenger_hub_backend.security;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

class LoginThrottleTest {

    /** A clock the test moves by hand. */
    static class ManualClock extends Clock {
        Instant now = Instant.parse("2026-10-31T12:00:00Z");
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
        void advance(Duration d) { now = now.plus(d); }
    }

    private final ManualClock clock = new ManualClock();
    private final LoginThrottle throttle = new LoginThrottle(clock);

    private void fail(String address, String email, int times) {
        for (int i = 0; i < times; i++) throttle.failed(address, email);
    }

    @Test
    void allowsFourFailuresAndBlocksTheFifth() {
        fail("1.1.1.1", "a@x.test", LoginThrottle.PER_ACCOUNT - 1);
        assertTrue(throttle.retryAfter("1.1.1.1", "a@x.test").isZero());
        fail("1.1.1.1", "a@x.test", 1);
        assertEquals(LoginThrottle.WINDOW, throttle.retryAfter("1.1.1.1", "a@x.test"));
    }

    @Test
    void unblocksOnceTheOldestFailureLeavesTheWindow() {
        fail("1.1.1.1", "a@x.test", LoginThrottle.PER_ACCOUNT);
        clock.advance(LoginThrottle.WINDOW.plusSeconds(1));
        assertTrue(throttle.retryAfter("1.1.1.1", "a@x.test").isZero());
    }

    @Test
    void emailCaseDoesNotGiveExtraAttempts() {
        fail("1.1.1.1", "A@X.test", LoginThrottle.PER_ACCOUNT);
        assertFalse(throttle.retryAfter("1.1.1.1", "a@x.test").isZero());
    }

    @Test
    void anotherAddressCannotLockTheOwnerOut() {
        fail("6.6.6.6", "owner@x.test", LoginThrottle.PER_ACCOUNT);
        assertTrue(throttle.retryAfter("1.1.1.1", "owner@x.test").isZero());
    }

    @Test
    void oneAddressCannotWalkThroughManyAccounts() {
        for (int i = 0; i < LoginThrottle.PER_ADDRESS; i++) throttle.failed("6.6.6.6", "user" + i + "@x.test");
        assertFalse(throttle.retryAfter("6.6.6.6", "someone-new@x.test").isZero());
    }

    @Test
    void successClearsTheAccountCount() {
        fail("1.1.1.1", "a@x.test", LoginThrottle.PER_ACCOUNT - 1);
        throttle.succeeded("1.1.1.1", "a@x.test");
        fail("1.1.1.1", "a@x.test", LoginThrottle.PER_ACCOUNT - 1);
        assertTrue(throttle.retryAfter("1.1.1.1", "a@x.test").isZero());
    }
}
