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
 * One way of reaching a person: a single personal chat in a single messenger.
 *
 * Identities are derived from chats rather than entered by hand, because a personal chat is
 * the only place the platform reliably learns a counterpart's name. Group chats are excluded
 * — their name describes the room, not a person.
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
     * Held as a plain id, not an association: the matcher compares every identity against
     * every other and only needs to know which account each came from, so a lazy reference
     * per row would mean a query per row.
     */
    @Column(name = "messenger_account_id", nullable = false)
    private Long messengerAccountId;

    @Column(name = "external_chat_id", nullable = false)
    private String externalChatId;

    /**
     * Copied from the chat rather than read through it, so a rename in the messenger cannot
     * silently change what a past linking decision was based on.
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
