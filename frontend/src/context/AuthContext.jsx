import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCurrentUser,
  loginWithGoogle as loginWithGoogleRequest,
  logout as logoutRequest,
  refreshSession,
} from '../services/api';

const AuthContext = createContext(null);

// Access tokens last 15 minutes; refresh a little early so a long practice
// session never fails mid-request because the token expired.
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const refreshTimerRef = useRef(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Restores the session on page load: /auth/me works while the access token is
  // still valid, otherwise the refresh cookie mints a new one.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const data = await getCurrentUser();
        if (!cancelled) {
          setUser(data.user);
          setStatus('authenticated');
        }
        return;
      } catch {
        // Access token missing or expired — fall through to refresh.
      }

      try {
        const data = await refreshSession();
        if (!cancelled) {
          setUser(data.user);
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setStatus('anonymous');
        }
      }
    }

    restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    clearRefreshTimer();

    if (status !== 'authenticated') {
      return undefined;
    }

    refreshTimerRef.current = setInterval(() => {
      refreshSession()
        .then((data) => setUser(data.user))
        .catch(() => {
          setUser(null);
          setStatus('anonymous');
        });
    }, REFRESH_INTERVAL_MS);

    return clearRefreshTimer;
  }, [status, clearRefreshTimer]);

  const loginWithGoogle = useCallback(async (idToken) => {
    const data = await loginWithGoogleRequest(idToken);
    setUser(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    role: user?.userRole || null,
    isAdmin: user?.userRole === 'admin',
    isMentor: user?.userRole === 'mentor',
    loginWithGoogle,
    logout,
  }), [user, status, loginWithGoogle, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
