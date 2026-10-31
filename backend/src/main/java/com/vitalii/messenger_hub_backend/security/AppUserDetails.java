package com.vitalii.messenger_hub_backend.security;

import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;

import java.time.Instant;
import java.util.Collection;

/** Spring's user, plus the moment before which this user's tokens no longer count. */
@Getter
public class AppUserDetails extends User {

    private final Instant credentialsChangedAt;

    public AppUserDetails(String email, String passwordHash, boolean enabled,
                          Collection<? extends GrantedAuthority> authorities, Instant credentialsChangedAt) {
        super(email, passwordHash, enabled, true, true, true, authorities);
        this.credentialsChangedAt = credentialsChangedAt;
    }
}
