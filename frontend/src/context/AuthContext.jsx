import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/authApi';
import { tokenStore, setUnauthorizedHandler } from '../api/apiClient';
import { useToast } from './ToastContext';
import { money } from '../utils/format';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const clear = useCallback(() => { tokenStore.set(null); setUser(null); setBusiness(null); }, []);

  // Restore the session on page load.
  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi.me().then((r) => { setUser(r.user); setBusiness(r.business); }).catch(() => clear()).finally(() => setLoading(false));
  }, [clear]);

  // apiClient calls this whenever the API answers 401 (expired / invalid session).
  useEffect(() => {
    setUnauthorizedHandler(() => { clear(); toast.error('Your session has expired. Please sign in again.'); });
    return () => setUnauthorizedHandler(null);
  }, [clear, toast]);

  const applySession = useCallback((r) => { tokenStore.set(r.token); setUser(r.user); setBusiness(r.business); }, []);
  const login = useCallback(async (email, password) => { const r = await authApi.login(email, password); applySession(r); return r; }, [applySession]);
  const logout = useCallback(async () => { try { await authApi.logout(); } catch { /* ignore */ } clear(); }, [clear]);
  const refresh = useCallback(async () => { const r = await authApi.me(); setUser(r.user); setBusiness(r.business); }, []);

  const value = useMemo(() => ({
    user, business, loading, login, applySession, logout, refresh, setBusiness, setUser,
    isAdmin: user?.role === 'admin',
    // UI-only permission helper. The PHP API must enforce the same rules on the server.
    can: (module, action = 'view') => Boolean(user && (user.role === 'admin' || user.permissions?.[module]?.[action])),
    fmt: (n) => money(n, business?.settings?.currency || '$'),
  }), [user, business, loading, login, applySession, logout, refresh]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
