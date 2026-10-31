package com.vitalii.messenger_hub_backend.security;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class CryptoServiceTest {

    private static final String KEY = Base64.getEncoder()
            .encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    private final CryptoService crypto = new CryptoService(KEY);

    @Test
    void roundTripsAValue() {
        String session = "1BVtsOKcBu4mLxT9wZ2rQ==sample-telethon-session";

        String encrypted = crypto.encrypt(session);

        assertNotEquals(session, encrypted, "value must not be stored in clear text");
        assertTrue(encrypted.startsWith("enc:v1:"));
        assertEquals(session, crypto.decrypt(encrypted));
    }

    @Test
    void producesDifferentCiphertextForTheSameInput() {
        // A fresh IV per call: identical tokens must not produce identical ciphertext.
        assertNotEquals(crypto.encrypt("same"), crypto.encrypt("same"));
    }

    @Test
    void passesThroughValuesStoredBeforeEncryptionExisted() {
        String legacyPlaintext = "plain-token-written-before-this-feature";
        assertEquals(legacyPlaintext, crypto.decrypt(legacyPlaintext));
    }

    @Test
    void doesNotDoubleEncrypt() {
        String once = crypto.encrypt("token");
        assertEquals(once, crypto.encrypt(once));
    }

    @Test
    void handlesNullAndEmpty() {
        assertNull(crypto.encrypt(null));
        assertNull(crypto.decrypt(null));
        assertEquals("", crypto.encrypt(""));
        assertEquals("", crypto.decrypt(""));
    }

    @Test
    void returnsNullWhenTheKeyNoLongerMatches() {
        String encrypted = crypto.encrypt("token");

        CryptoService withRotatedKey = new CryptoService(Base64.getEncoder()
                .encodeToString("fedcba9876543210fedcba9876543210".getBytes()));

        assertNull(withRotatedKey.decrypt(encrypted),
                "an unreadable credential must surface as null, not garbage");
    }

    @Test
    void rejectsAKeyOfTheWrongLength() {
        String tooShort = Base64.getEncoder().encodeToString("short".getBytes());
        assertThrows(IllegalStateException.class, () -> new CryptoService(tooShort));
    }
}
