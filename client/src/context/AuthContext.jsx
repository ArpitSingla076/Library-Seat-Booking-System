import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';
import { getSession, setSession, clearSession } from '../services/session';

const AuthContext = createContext(null);

// Sessions are stored per role (see services/session.js) so admin and student tabs do not clash
const storeTokens = (role, data) => setSession(role, data);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const session = getSession();
    if (!session?.token && !session?.refreshToken) { setLoading(false); return; }
    try {
      const res = await authAPI.me(); // the api layer refreshes an expired token automatically
      setUser(res.data.user);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (identifier, password, otp) => {
    const res = await authAPI.login({ identifier, password, otp: otp || undefined });
    storeTokens(res.data.user.role, res.data);
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    storeTokens(res.data.user.role, res.data);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    const refreshToken = getSession()?.refreshToken;
    clearSession();
    setUser(null);
    toast.success('Logged out');
    if (refreshToken) authAPI.logout(refreshToken).catch(() => {});
  };

  // Called after change-password so the current session stays valid
  const applyTokens = (data) => storeTokens(user?.role || 'student', data);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser: loadUser, applyTokens }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
