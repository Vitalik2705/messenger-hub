package com.vitalii.messenger_hub_backend.model.enums;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Pins down how a reported chat kind is read, and what happens when there isn't one.
 *
 * The fallback is the part worth testing: a messenger service running code older than this
 * field reports nothing, and the wrong default would either flood contact linking with bots
 * or make every group look like a person.
 */
class ChatKindTest {

    @Test
    void readsWhatTheMessengerReported() {
        assertEquals(ChatKind.BOT, ChatKind.parse("BOT", "PERSONAL"));
        assertEquals(ChatKind.CHANNEL, ChatKind.parse("CHANNEL", "GROUP"));
        assertEquals(ChatKind.SERVICE, ChatKind.parse("SERVICE", "PERSONAL"));
    }

    /** Services are free to send whatever case; the value is ours either way. */
    @Test
    void isCaseInsensitive() {
        assertEquals(ChatKind.PERSON, ChatKind.parse("person", "PERSONAL"));
        assertEquals(ChatKind.GROUP, ChatKind.parse("Group", "GROUP"));
    }

    /**
     * The reported kind wins over the coarse type — that is the entire point. A Telegram
     * channel arrives as chatType GROUP and kind CHANNEL, and must stay a channel.
     */
    @Test
    void reportedKindOutranksTheCoarseChatType() {
        assertEquals(ChatKind.CHANNEL, ChatKind.parse("CHANNEL", "GROUP"));
        assertEquals(ChatKind.BOT, ChatKind.parse("BOT", "PERSONAL"));
    }

    /**
     * An un-upgraded service reports nothing. Falling back to the coarse type reproduces
     * exactly the old behaviour, so its chats keep working instead of being misfiled.
     */
    @Test
    void fallsBackToTheChatTypeWhenNothingWasReported() {
        assertEquals(ChatKind.PERSON, ChatKind.parse(null, "PERSONAL"));
        assertEquals(ChatKind.GROUP, ChatKind.parse(null, "GROUP"));
    }

    /** A value we don't recognise is treated as no value, not as a parse failure. */
    @Test
    void unknownValuesFallBackRatherThanThrow() {
        assertEquals(ChatKind.PERSON, ChatKind.parse("SUPERGROUP_V2", "PERSONAL"));
        assertEquals(ChatKind.GROUP, ChatKind.parse("", "GROUP"));
    }

    /**
     * With neither a kind nor a usable type, PERSON is the deliberate choice: contact
     * linking only ever *proposes*, so admitting a non-person costs one dismissible
     * suggestion, while excluding a real person loses the link silently.
     */
    @Test
    void defaultsToPersonWhenNothingIsKnown() {
        assertEquals(ChatKind.PERSON, ChatKind.parse(null, null));
    }
}
