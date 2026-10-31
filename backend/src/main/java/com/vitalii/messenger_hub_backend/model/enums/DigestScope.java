package com.vitalii.messenger_hub_backend.model.enums;

import java.util.List;

/**
 * Which chats a digest counts. Channels, bots and service accounts post regardless of the user and
 * would bury personal messages; groups are the user's choice.
 */
public enum DigestScope {

    /** Only people. The default, because only a person can be waiting for an answer. */
    PEOPLE(List.of(ChatKind.PERSON)),

    /** People and the group chats they write in. */
    PEOPLE_AND_GROUPS(List.of(ChatKind.PERSON, ChatKind.GROUP)),

    /** Everything that arrived, channels and bots included. */
    ALL(List.of(ChatKind.values()));

    private final List<ChatKind> kinds;

    DigestScope(List<ChatKind> kinds) {
        this.kinds = kinds;
    }

    /** The kinds this scope admits, as the names stored in the {@code chat_kind} column. */
    public List<String> kindNames() {
        return kinds.stream().map(Enum::name).toList();
    }

    public static DigestScope parse(String value) {
        if (value == null) return PEOPLE;
        for (DigestScope scope : values()) {
            if (scope.name().equalsIgnoreCase(value)) return scope;
        }
        return PEOPLE;
    }
}
