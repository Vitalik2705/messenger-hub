package com.vitalii.messenger_hub_backend.model.dto;

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
public class MessengerAccountDTO {
    private Long id;
    private MessengerType messengerType;
    private String username;
    private String accountLabel;
    private String externalUserId;
    private Boolean isConnected;
    private LocalDateTime lastSyncAt;
    private LocalDateTime createdAt;
}