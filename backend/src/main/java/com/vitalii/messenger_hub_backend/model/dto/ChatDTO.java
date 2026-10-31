package com.vitalii.messenger_hub_backend.model.dto;

import com.vitalii.messenger_hub_backend.model.enums.ChatKind;
import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatDTO {
    private Long id;
    private Long messengerAccountId;
    private MessengerType messengerType;
    private String externalChatId;
    private String chatType;
    /** Person, bot, channel, group or service account — as the messenger reports it. */
    private ChatKind chatKind;
    private String name;
    private String avatarUrl;
    private Integer unreadCount;
    private String lastMessage;
    private LocalDateTime lastMessageAt;
    private Boolean isArchived;
    private String avatarBase64;
    private Boolean isPinned;
}