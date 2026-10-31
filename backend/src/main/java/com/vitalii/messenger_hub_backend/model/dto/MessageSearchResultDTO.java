package com.vitalii.messenger_hub_backend.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One hit from a history search: enough to render a result row and to jump straight to the
 * message in its chat, without a second round-trip.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageSearchResultDTO {

    private Long messageId;
    private Long chatId;
    private String chatName;
    private String messengerType;

    private String senderName;
    private Boolean isFromUser;
    private LocalDateTime timestamp;

    /** The full message text, for opening the message in context. */
    private String text;

    /**
     * The matching fragment, with hits wrapped in {@code [[hl]]…[[/hl]]}. Built by Postgres,
     * which knows exactly which tokens matched — highlighting on the client would have to
     * guess at prefix matches and get them wrong.
     *
     * The markers are deliberately not HTML. Around them sits unescaped text that arrived
     * from a messenger, so the snippet must never be injected as markup; the client splits
     * on the markers and renders each piece as text. A plain-text sentinel keeps that the
     * only reasonable way to consume it.
     */
    private String snippet;

    private Double rank;
}
