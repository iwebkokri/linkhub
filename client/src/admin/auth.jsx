import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, setSetupRequiredHandler, setUnauthorizedHandler } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const d = await api.get('/api/auth/me');
    setUser(d.user);
    return d.user;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    setSetupRequiredHandler(() => refresh().catch(() => setUser(null)));
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    return () => {
      setUnauthorizedHandler(null);
      setSetupRequiredHandler(null);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      setUser,
      /** Resolves to { user } or, when the account has two-factor on, { twoFactorRequired, challenge }. */
      async login(email, password) {
        const d = await api.post('/api/auth/login', { email, password });
        if (d.user) setUser(d.user);
        return d;
      },
      async verifyTwoFactor(challenge, code) {
        const d = await api.post('/api/auth/2fa/verify', { challenge, code });
        setUser(d.user);
        return d.user;
      },
      async logout() {
        await api.post('/api/auth/logout').catch(() => {});
        setUser(null);
      },
    }),
    [user, loading, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Layout route: everything nested inside needs a signed-in user. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot" aria-busy="true" />;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function RequireAdmin({ children }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? children : <Navigate to="/admin" replace />;
}
