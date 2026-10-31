package com.vitalii.messenger_hub_backend.model.dto;

import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One account a person can be reached through. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContactIdentityDTO {
    private Long id;
    private Long chatId;
    private MessengerType messengerType;
    /**
     * Which of the user's accounts sees this chat.
     *
     * Needed to tell two identities apart at all when they sit on the same network: a person
     * reachable from two Telegram accounts otherwise renders as the same name twice.
     */
    private Long messengerAccountId;
    private String externalChatId;
    private String displayName;
    /** Null while this identity is not linked to anything. */
    private Long contactId;
}
