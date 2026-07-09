/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (data: Partial<User> & { instagram?: string; twitter?: string; github?: string }) => Promise<boolean>;
  updateStatus: (status: 'online' | 'idle' | 'offline') => Promise<void>;
  searchUsers: () => Promise<User[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session
  useEffect(() => {
    const storedToken = localStorage.getItem('homiehub_token');
    const storedUser = localStorage.getItem('homiehub_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      
      // Fetch fresh profile in the background
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Session expired');
        })
        .then(data => {
          setUser(data.user);
          localStorage.setItem('homiehub_user', JSON.stringify(data.user));
        })
        .catch(() => {
          // Token expired or server unreachable
          localStorage.removeItem('homiehub_token');
          localStorage.removeItem('homiehub_user');
          setToken(null);
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // 1. LOGIN
  const login = async (usernameOrEmail: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail, password })
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(
          res.status === 502 || res.status === 503 || res.status === 504 || res.status === 404
            ? 'The server is temporarily offline or restarting. Please try again in a few seconds.'
            : 'Server returned an invalid non-JSON response.'
        );
      }

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('homiehub_token', data.token);
      localStorage.setItem('homiehub_user', JSON.stringify(data.user));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  // 2. REGISTER
  const register = async (username: string, email: string, password: string, displayName?: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, displayName })
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(
          res.status === 502 || res.status === 503 || res.status === 504 || res.status === 404
            ? 'The server is temporarily offline or restarting. Please try again in a few seconds.'
            : 'Server returned an invalid non-JSON response.'
        );
      }

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Registration failed' };
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('homiehub_token', data.token);
      localStorage.setItem('homiehub_user', JSON.stringify(data.user));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  // 3. LOGOUT
  const logout = () => {
    if (user && token) {
      // Try to let server know we're offline
      fetch('/api/auth/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'offline' })
      }).catch(() => {});
    }

    setToken(null);
    setUser(null);
    localStorage.removeItem('homiehub_token');
    localStorage.removeItem('homiehub_user');
  };

  // 4. UPDATE PROFILE
  const updateProfile = async (data: Partial<User> & { instagram?: string; twitter?: string; github?: string }) => {
    if (!token) return false;
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const result = await res.json();
        setUser(result.user);
        localStorage.setItem('homiehub_user', JSON.stringify(result.user));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // 5. UPDATE STATUS
  const updateStatus = async (status: 'online' | 'idle' | 'offline') => {
    if (!token || !user) return;
    try {
      const res = await fetch('/api/auth/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const result = await res.json();
        setUser(prev => prev ? { ...prev, onlineStatus: result.status } : null);
      }
    } catch {}
  };

  // 6. SEARCH USERS
  const searchUsers = async (): Promise<User[]> => {
    if (!token) return [];
    try {
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.users;
      }
      return [];
    } catch {
      return [];
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateProfile, updateStatus, searchUsers }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
