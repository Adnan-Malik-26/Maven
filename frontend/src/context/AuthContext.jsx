import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Restore session on mount ──────────────────────────────────────────
  useEffect(() => {
    const restore = async () => {
      const accessToken  = localStorage.getItem('maven_access_token');
      const refreshToken = localStorage.getItem('maven_refresh_token');
      const storedUser   = localStorage.getItem('maven_user');

      if (accessToken && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          // Hydrate the Supabase client so realtime/direct queries work
          if (refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
        } catch (_) {
          _clearSession();
        }
      }
      setLoading(false);
    };
    restore();
  }, []);

  // ── Internal helpers ──────────────────────────────────────────────────
  const _persistSession = useCallback(async (userData, session) => {
    setUser(userData);
    localStorage.setItem('maven_access_token',  session.access_token);
    localStorage.setItem('maven_refresh_token', session.refresh_token ?? '');
    localStorage.setItem('maven_user',          JSON.stringify(userData));

    // Hydrate Supabase client for realtime subscriptions
    await supabase.auth.setSession({
      access_token:  session.access_token,
      refresh_token: session.refresh_token ?? '',
    });
  }, []);

  const _clearSession = useCallback(() => {
    setUser(null);
    localStorage.removeItem('maven_access_token');
    localStorage.removeItem('maven_refresh_token');
    localStorage.removeItem('maven_user');
  }, []);

  // ── Public API ────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const { data: body } = await authApi.login(email, password);
    // Supabase session lives under body.data.session
    const session = body.data?.session;
    const userData = body.data?.user;
    if (!session) throw new Error('Login succeeded but no session was returned.');
    await _persistSession(userData, session);
    return { user: userData, session };
  }, [_persistSession]);

  const signup = useCallback(async (email, password, firstName, lastName) => {
    const { data: body } = await authApi.signup(email, password, firstName, lastName);
    const session = body.data?.session;
    const userData = body.data?.user;
    // After email-confirmation flows session may be null – handle gracefully
    if (session) await _persistSession(userData, session);
    return { user: userData, session };
  }, [_persistSession]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch (_) { /* ignore 401 on stale token */ }
    try { await supabase.auth.signOut(); } catch (_) {}
    _clearSession();
  }, [_clearSession]);

  const resetPassword = useCallback(async (email) => {
    await authApi.resetPassword(email);
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
