package com.vitalii.messenger_hub_backend.model.entity;

import com.vitalii.messenger_hub_backend.model.enums.AutoReplyMode;
import com.vitalii.messenger_hub_backend.model.enums.ChatKind;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "chats")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Chat {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "messenger_account_id", nullable = false)
    private MessengerAccount messengerAccount;

    @Column(name = "external_chat_id", nullable = false)
    private String externalChatId;

    @Column(name = "chat_type")
    private String chatType; // PERSONAL, GROUP, CHANNEL

    /**
     * What is on the other side, as the messenger reports it. Finer than chatType, which cannot
     * tell a friend from a channel or a bot.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "chat_kind", length = 16)
    private ChatKind chatKind;

    /** Whether and how far the model may write in this chat. Per chat by design; null means OFF. */
    @Enumerated(EnumType.STRING)
    @Column(name = "auto_reply_mode", length = 16)
    private AutoReplyMode autoReplyMode;

    @Column(name = "name")
    private String name;

    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    @Column(name = "avatar_base64", columnDefinition = "TEXT")
    private String avatarBase64;

    // Without @Builder.Default Lombok ignores the field initialiser and
    // Chat.builder()...build() leaves these null.
    @Builder.Default
    @Column(name = "unread_count")
    private Integer unreadCount = 0;

    @Column(name = "last_message_at")
    private LocalDateTime lastMessageAt;

    @Builder.Default
    @Column(name = "is_archived")
    private Boolean isArchived = false;

    @Builder.Default
    @Column(name = "is_pinned", nullable = false, columnDefinition = "boolean default false")
    private Boolean isPinned = false;

    @Column(name = "recipient_id")
    private String recipientId;

    /** When the background archiver last pulled this chat's history. */
    @Column(name = "last_archived_at")
    private LocalDateTime lastArchivedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}