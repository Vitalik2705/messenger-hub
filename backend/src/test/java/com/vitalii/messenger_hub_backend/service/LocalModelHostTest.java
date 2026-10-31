package com.vitalii.messenger_hub_backend.service;

import org.junit.jupiter.api.Test;

import static com.vitalii.messenger_hub_backend.service.SystemStatusService.isLocalHost;
import static org.junit.jupiter.api.Assertions.*;

/**
 * The status panel's claim that analysis stays on this machine.
 *
 * It is the one line of the panel that states a property of the whole system rather than
 * the health of a part, so it must not say "local" for an address that is not.
 */
class LocalModelHostTest {

    @Test
    void recognisesThisMachineAndItsContainers() {
        assertTrue(isLocalHost("http://localhost:11434"));
        assertTrue(isLocalHost("http://127.0.0.1:11434"));
        assertTrue(isLocalHost("http://host.docker.internal:11434"), "Ollama on the Docker host");
        assertTrue(isLocalHost("http://ollama:11434"), "the optional compose container");
        assertTrue(isLocalHost("http://192.168.1.20:11434"), "a machine on the home network");
    }

    @Test
    void doesNotCallRemoteServicesLocal() {
        assertFalse(isLocalHost("https://api.openai.com"));
        assertFalse(isLocalHost("http://8.8.8.8:11434"));
        assertFalse(isLocalHost("not a url"));
    }
}
