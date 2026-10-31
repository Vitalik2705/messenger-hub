import { createContext, useState, useContext } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

/** The signed-in user, read synchronously from storage as the initial state. */
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(authService.getCurrentUser);

    const login = async (email, password) => {
        const data = await authService.login({ email, password });
        setUser(data.user);
        return data;
    };

    const register = async (registerData) => {
        const data = await authService.register(registerData);
        setUser(data.user);
        return data;
    };

    /** After the profile is edited in settings: the new name shows everywhere at once. */
    const updateUser = (next) => {
        authService.storeUser(next);
        setUser(next);
    };

    const logout = () => {
        authService.logout();
        setUser(null);
    };

    const value = { user, login, register, updateUser, logout, isAuthenticated: !!user };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
