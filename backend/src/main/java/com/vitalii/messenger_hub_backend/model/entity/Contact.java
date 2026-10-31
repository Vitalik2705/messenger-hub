package com.vitalii.messenger_hub_backend.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A person, as distinct from the accounts they can be reached through.
 *
 * A contact exists only once two or more identities have been linked — a handle nobody has
 * connected to anything else is just a {@link ContactIdentity} standing on its own. That
 * keeps the table meaningful: every row here is a judgement the user actually made.
 */
@Entity
@Table(name = "contacts", indexes = @Index(name = "idx_contacts_user", columnList = "user_id"))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Contact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Defaults to the name of the first identity linked, and the user may rename it. */
    @Column(name = "display_name")
    private String displayName;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
