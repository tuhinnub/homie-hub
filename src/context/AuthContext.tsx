/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types.js';

interface AuthResult {
  success: boolean;
  error?: string;
  code?: string;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<AuthResult>;
  register: (username: string, email: string, password: string, displayName?: string) => Promise<AuthResult>;
  resetPassword: (usernameOrEmail: string, newPassword: string) => Promise<AuthResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  logout: () => void;
  updateProfile: (data: Partial<User> & { instagram?: string; twitter?: string; github?: string }) => Promise<boolean>;
  updateStatus: (status: 'online' | 'idle' | 'offline') => Promise<void>;
  searchUsers: () => Promise<User[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Safe localStorage helpers for iframe environments
function safeGetStorage(key: string): string | null {
  try {
    const val = localStorage.getItem(key);
    if (!val || val === 'undefined' || val === 'null') return null;
    return val;
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or iframe partitioning errors
  }
}

function safeRemoveStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

function safeParseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.id) {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      // Fall through to descriptive status error below if body is not valid JSON
    }
  }
  throw new Error(
    res.status === 502 || res.status === 503 || res.status === 504
      ? 'The server is temporarily restarting. Please try again in a few seconds.'
      : `Unable to reach authentication service (${res.status}). Please try again.`
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const persistSession = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    safeSetStorage('homiehub_token', newToken);
    safeSetStorage('homiehub_user', JSON.stringify(newUser));
  };

  const clearSession = () => {
    setToken(null);
    setUser(null);
    safeRemoveStorage('homiehub_token');
    safeRemoveStorage('homiehub_user');
  };

  // Check for existing session on mount
  useEffect(() => {
    const storedToken = safeGetStorage('homiehub_token');
    const storedUser = safeParseUser(safeGetStorage('homiehub_user'));

    if (!storedToken) {
      clearSession();
      setIsLoading(false);
      return;
    }

    if (storedUser) {
      setToken(storedToken);
      setUser(storedUser);
    }

    // Verify token and fetch fresh profile
    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${storedToken}`,
        'Cache-Control': 'no-cache'
      }
    })
      .then(async res => {
        if (res.ok) {
          const data = await parseJsonResponse(res);
          if (data?.user) {
            persistSession(storedToken, data.user);
          }
          return;
        }
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          clearSession();
        }
      })
      .catch(() => {
        // Keep cached session if only a transient network hiccup occurred and storedUser exists
        if (!storedUser) {
          clearSession();
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  // 1. LOGIN
  const login = async (usernameOrEmail: string, password: string): Promise<AuthResult> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: usernameOrEmail.trim(), password })
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Login failed. Please check your credentials.',
          code: data.code
        };
      }

      if (data.token && data.user) {
        persistSession(data.token, data.user);
        return { success: true, message: data.message };
      }
      return { success: false, error: 'Invalid authentication response from server.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error while signing in.' };
    }
  };

  // 2. REGISTER
  const register = async (
    username: string,
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthResult> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          displayName: displayName?.trim()
        })
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Registration failed.',
          code: data.code
        };
      }

      if (data.token && data.user) {
        persistSession(data.token, data.user);
        return { success: true, message: data.message };
      }
      return { success: false, error: 'Invalid registration response from server.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during registration.' };
    }
  };

  // 3. RESET PASSWORD
  const resetPassword = async (usernameOrEmail: string, newPassword: string): Promise<AuthResult> => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: usernameOrEmail.trim(), newPassword })
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Password reset failed.',
          code: data.code
        };
      }

      if (data.token && data.user) {
        persistSession(data.token, data.user);
        return { success: true, message: data.message };
      }
      return { success: false, error: 'Invalid response from server.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during password reset.' };
    }
  };

  // 4. CHANGE PASSWORD
  const changePassword = async (currentPassword: string, newPassword: string): Promise<AuthResult> => {
    if (!token) return { success: false, error: 'Not authenticated' };
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update password' };
      }
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  // 5. LOGOUT
  const logout = () => {
    if (user && token) {
      fetch('/api/auth/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'offline' })
      }).catch(() => {});
    }

    clearSession();
  };

  // 6. UPDATE PROFILE
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
        const result = await parseJsonResponse(res);
        if (result?.user) {
          persistSession(token, result.user);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  // 7. UPDATE STATUS
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
        const result = await parseJsonResponse(res);
        setUser(prev => {
          if (!prev) return null;
          const updated = { ...prev, onlineStatus: result.status };
          safeSetStorage('homiehub_user', JSON.stringify(updated));
          return updated;
        });
      }
    } catch {}
  };

  // 8. SEARCH USERS
  const searchUsers = async (): Promise<User[]> => {
    if (!token) return [];
    try {
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await parseJsonResponse(res);
        return data.users || [];
      }
      return [];
    } catch {
      return [];
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        resetPassword,
        changePassword,
        logout,
        updateProfile,
        updateStatus,
        searchUsers
      }}
    >
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
