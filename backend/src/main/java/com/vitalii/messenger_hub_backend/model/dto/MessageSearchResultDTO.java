package com.vitalii.messenger_hub_backend.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** One history search hit: enough to render the row and open the message in its chat. */
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
     * The matching fragment from Postgres, with hits wrapped in {@code [[hl]]…[[/hl]]}. Plain-text
     * markers rather than HTML, because the surrounding text is unescaped messenger content; the
     * client splits on them and renders text.
     */
    private String snippet;

    private Double rank;

    /**
     * In hybrid search, which search found this message: "both", "text" or "semantic". Null in
     * single-mode searches.
     */
    private String matchedBy;
}
