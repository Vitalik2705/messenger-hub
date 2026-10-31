package com.vitalii.messenger_hub_backend.model.entity;

import com.vitalii.messenger_hub_backend.model.enums.ContactLinkStatus;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A proposal that two identities belong to the same person, awaiting the user's judgement.
 *
 * The pair is always stored with the lower identity id first. Without that, the same two
 * handles could be recorded twice in opposite orders and the unique constraint would let
 * both through — the user would then be asked the same question twice.
 */
@Entity
@Table(
        name = "contact_link_suggestions",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_contact_link_pair",
                columnNames = {"identity_a_id", "identity_b_id"}),
        indexes = @Index(name = "idx_contact_link_user_status", columnList = "user_id, status")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContactLinkSuggestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "identity_a_id", nullable = false)
    private ContactIdentity identityA;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "identity_b_id", nullable = false)
    private ContactIdentity identityB;

    @Column(name = "score", nullable = false)
    private Double score;

    /** Why the matcher proposed this, shown verbatim so the user can judge rather than trust. */
    @Column(name = "reasons")
    private String reasons;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ContactLinkStatus status = ContactLinkStatus.PENDING;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;
}
