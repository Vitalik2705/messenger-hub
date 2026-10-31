import api from './api';

/** The signed-in user's own account: profile, password, stored data, deletion. */
const userService = {
    updateProfile: (profile) => api.put('/users/me', profile).then(r => r.data),

    /** Every older token stops working; the response carries this session's new pair. */
    changePassword: (currentPassword, newPassword) =>
        api.post('/users/me/password', { currentPassword, newPassword }).then(r => r.data),

    /** Signs out every other browser; this one continues on the new pair it gets back. */
    endOtherSessions: () => api.post('/users/me/sessions/end-others').then(r => r.data),

    /** Connected accounts and how much correspondence is stored for them. */
    overview: () => api.get('/users/me/overview').then(r => r.data),

    /** Removes the account and everything stored for it; asks for the password again. */
    deleteAccount: (password) => api.delete('/users/me', { data: { password } }),
};

export default userService;
