package com.vitalii.messenger_hub_backend.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageDTO {
    private Long id;
    private Long chatId;
    private String externalMessageId;
    private String senderId;
    private String senderName;
    private String text;
    private String attachments;
    private Boolean isFromUser;
    private String status;
    private LocalDateTime timestamp;
    private Boolean isRead;
    // media
    private String mediaType;    // "photo", "audio", "video", "sticker", "file"
    private String mediaBase64;
    private String mediaMime;
    private String fileName;
    private Integer duration;    // seconds, for audio/video

    private String replyToMessageId;
    private String replyToText;
    private String replyToSenderName;
}