package com.vitalii.messenger_hub_backend.model.enums;

import java.util.List;

/**
 * Which chats a digest is about.
 *
 * A digest answers "what did I miss", and a news channel never wrote to anybody — it posted,
 * as it does every hour, whether or not the user existed. Counting those alongside messages
 * from friends buries the three that were actually addressed to them under two hundred that
 * were not. Bots and the messenger's own service account are the same story.
 *
 * Groups sit in between: a dormitory chat is noise on some days and the only thing that
 * mattered on others, so it is the user's call rather than a default.
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
