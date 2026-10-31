package com.vitalii.messenger_hub_backend.model.entity;

import com.vitalii.messenger_hub_backend.model.enums.MessengerType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * One way of reaching a person: a personal chat in one messenger. Derived from chats; groups are
 * excluded because their name describes the room.
 */
@Entity
@Table(
        name = "contact_identities",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_contact_identities_chat",
                columnNames = "chat_id"),
        indexes = {
                @Index(name = "idx_contact_identities_user", columnList = "user_id"),
                @Index(name = "idx_contact_identities_contact", columnList = "contact_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContactIdentity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Null until the user links this identity to another one. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id")
    private Contact contact;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chat_id", nullable = false)
    private Chat chat;

    @Enumerated(EnumType.STRING)
    @Column(name = "messenger_type", nullable = false)
    private MessengerType messengerType;

    /**
     * A plain id rather than an association: the matcher only needs the account, and a lazy
     * reference per row would mean a query per row.
     */
    @Column(name = "messenger_account_id", nullable = false)
    private Long messengerAccountId;

    @Column(name = "external_chat_id", nullable = false)
    private String externalChatId;

    /**
     * Copied from the chat, so a later rename does not change what a linking decision was based on.
     */
    @Column(name = "display_name")
    private String displayName;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
