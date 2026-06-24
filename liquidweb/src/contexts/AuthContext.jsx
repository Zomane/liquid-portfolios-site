import React, { createContext, useContext, useState, useEffect } from 'react';
import { initCSRF } from '../utils/api';
const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        initCSRF();
        const token = localStorage.getItem('auth_token');
        if (token) {
            fetchUser(token);
        } else {
            setLoading(false);
        }
    }, []);
    const fetchUser = async (token) => {
        try {
            const response = await fetch(`${API_URL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
            } else {
                localStorage.removeItem('auth_token');
            }
        } catch (error) {
            console.error('Failed to fetch user:', error);
            localStorage.removeItem('auth_token');
        } finally {
            setLoading(false);
        }
    };
    const login = () => {
        window.location.href = `${API_URL}/api/auth/login`;
    };
    const handleCallback = (token) => {
        localStorage.setItem('auth_token', token);
        fetchUser(token);
    };
    const logout = () => {
        localStorage.removeItem('auth_token');
        setUser(null);
    };
    const value = {
        user,
        loading,
        login,
        logout,
        handleCallback,
        isAuthenticated: !!user,
    };
    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
