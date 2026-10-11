import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Synchronously initialize user from storage so session is available immediately on render 1
  const [user, setUser] = useState(() => authService.getCurrentUser());
  const [loading, setLoading] = useState(() => Boolean(authService.getToken()));

  useEffect(() => {
    let isMounted = true;
    // Check and validate persisted session on application startup
    const initAuth = async () => {
      const token = authService.getToken();
      if (!token) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await authService.getMe();
        if (!isMounted) return;
        if (res.user) {
          setUser(res.user);
        } else if (res.error && (res.error.includes('expired') || res.error.includes('Session expired'))) {
          // Genuine 401: token revoked or expired
          setUser(null);
        } else {
          // Fall back to cached user in storage
          const cached = authService.getCurrentUser();
          setUser(cached || null);
        }
      } catch (e) {
        console.error('Session verification error', e);
        if (isMounted) {
          const cached = authService.getCurrentUser();
          setUser(cached || null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    initAuth();

    // Listen for storage synchronization events across tabs or from native WebView injection
    const handleStorageChange = (e) => {
      if (e.key === 'zoorup_token' || e.key === 'zoorup_user') {
        const freshUser = authService.getCurrentUser();
        if (freshUser) {
          setUser(freshUser);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const login = async (credentials) => {
    setLoading(true);
    try {
      const res = await authService.login(credentials);
      if (res.user) {
        setUser(res.user);
      }
      return res;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (googleProfile) => {
    setLoading(true);
    try {
      const res = await authService.loginWithGoogle(googleProfile);
      if (res.user) {
        setUser(res.user);
      }
      return res;
    } finally {
      setLoading(false);
    }
  };

  const registerBusiness = async (data) => {
    setLoading(true);
    try {
      const res = await authService.registerBusiness(data);
      if (res.user) {
        setUser(res.user);
      }
      return res;
    } finally {
      setLoading(false);
    }
  };

  const registerCustomer = async (data) => {
    setLoading(true);
    try {
      const res = await authService.registerCustomer(data);
      if (res.user) {
        setUser(res.user);
      }
      return res;
    } finally {
      setLoading(false);
    }
  };

  const requestOTP = async (phone) => {
    return authService.requestOTP(phone);
  };

  const verifyOTP = async (phone, otp, customerName) => {
    setLoading(true);
    try {
      const res = await authService.verifyOTP(phone, otp, customerName);
      if (res.user) {
        setUser(res.user);
      }
      return res;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await authService.getMe();
      if (res.user) {
        setUser(res.user);
      }
      return res;
    } catch {
      return { user: null };
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isAuthenticated: Boolean(user),
        loading,
        login,
        loginWithGoogle,
        registerBusiness,
        registerCustomer,
        requestOTP,
        verifyOTP,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
