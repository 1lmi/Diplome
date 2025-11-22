import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setAuthToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login(login: string, password: string): Promise<void>;
  register(name: string, login: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("auth_token")
        : null;
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    api
      .me()
      .then(setUser)
      .catch(() => {
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAuth = async (fn: () => Promise<{ token: string; user: User }>) => {
    const res = await fn();
    setAuthToken(res.token);
    setUser(res.user);
  };

  const login = (login: string, password: string) =>
    handleAuth(() => api.login(login, password));
  const register = (name: string, login: string, password: string) =>
    handleAuth(() => api.register(name, login, password));
  const logout = async () => {
    await api.logout();
    setAuthToken(null);
    setUser(null);
  };
  const refresh = async () => {
    const me = await api.me();
    setUser(me);
  };

  const value: AuthContextValue = {
    user,
    loading,
    login,
    register,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
