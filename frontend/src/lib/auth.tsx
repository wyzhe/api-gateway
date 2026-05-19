import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, clearAuth, getRefreshToken, getToken, setRefreshToken, setToken } from "./api";
import type { User } from "./types";

export type { User };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!getToken() && !getRefreshToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const u = await api<User>("/api/auth/me", { silent: true });
      setUser(u);
    } catch {
      clearAuth();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const login = async (email: string, password: string) => {
    const resp = await api<{ access_token: string; refresh_token: string; user: User }>(
      "/api/auth/login",
      { method: "POST", body: { email, password } },
    );
    setToken(resp.access_token);
    setRefreshToken(resp.refresh_token);
    setUser(resp.user);
  };

  const logout = async () => {
    const rt = getRefreshToken();
    try {
      await api("/api/auth/logout", {
        method: "POST",
        body: rt ? { refresh_token: rt } : undefined,
        silent: true,
      });
    } catch {
      /* noop */
    }
    clearAuth();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, refresh, login, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside <AuthProvider>");
  return v;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin")
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="text-muted-foreground mt-2">This page requires the admin role.</p>
      </div>
    );
  return <>{children}</>;
}
