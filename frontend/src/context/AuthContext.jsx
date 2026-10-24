import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, loginUser, logoutUser } from '../api/auth.js';
import {
  clearStoredToken,
  getStoredToken,
  setUnauthorizedHandler,
  storeToken,
} from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On refresh, restore the session from the stored token (if it is
  // still valid). A 401 here just means "not logged in".
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (!getStoredToken()) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((data) => setUser(data.user))
      .catch(() => clearStoredToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const data = await loginUser(credentials);
    storeToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    // Best effort: even if the call fails, the session ends locally.
    try {
      await logoutUser();
    } catch {
      // Token is cleared below regardless.
    }
    clearStoredToken();
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
