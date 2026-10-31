import api from './api';

const contactService = {
    /** People the user has confirmed, each with every account linked to them. */
    getContacts: () => api.get('/contacts'),

    /** Every harvested handle, linked or not — the pool manual linking picks from. */
    getIdentities: () => api.get('/contacts/identities'),

    /** Pairs the matcher proposed and the user has not judged yet. */
    getSuggestions: () => api.get('/contacts/suggestions'),

    /** Re-reads the chat list and looks for new matches. Safe to call repeatedly. */
    rescan: () => api.post('/contacts/rescan'),

    confirm: (suggestionId) => api.post(`/contacts/suggestions/${suggestionId}/confirm`),

    reject: (suggestionId) => api.post(`/contacts/suggestions/${suggestionId}/reject`),

    /** "This is the same person", for pairs the matcher never proposed. */
    link: (identityAId, identityBId) => api.post('/contacts/link', { identityAId, identityBId }),

    unlink: (identityId) => api.post(`/contacts/identities/${identityId}/unlink`),

    rename: (contactId, displayName) => api.patch(`/contacts/${contactId}`, { displayName }),
};

export default contactService;
