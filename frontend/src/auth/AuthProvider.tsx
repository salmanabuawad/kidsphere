import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onUnauthenticated } from "@/lib/api";
import type { Role } from "@/lib/paths";

export type { Role } from "@/lib/paths";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  language: "ar" | "he" | "en";
};

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  /** POST /api/auth/login; resolves with the user or throws ApiError (INVALID_CREDENTIALS, RATE_LIMITED…). */
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Replace the cached user, e.g. after PUT /api/me. */
  setUser: (user: User) => void;
  /** Re-read GET /api/me. */
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Loads the session once (GET /api/me) and keeps the current user. Routing decisions live in RequireRole. */
export function AuthProvider({ children, initialUser }: { children: ReactNode; initialUser?: User | null }) {
  const [user, setUserState] = useState<User | null>(initialUser ?? null);
  const [status, setStatus] = useState<AuthStatus>(initialUser === undefined ? "loading" : initialUser ? "authenticated" : "anonymous");

  const apply = useCallback((u: User | null) => {
    setUserState(u);
    setStatus(u ? "authenticated" : "anonymous");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User }>("/api/me");
      apply(res.user);
    } catch {
      // 401 means signed out; a network/server error also lands on the login page, which shows the error on submit.
      apply(null);
    }
  }, [apply]);

  useEffect(() => {
    if (initialUser === undefined) void refresh();
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => onUnauthenticated(() => apply(null)), [apply]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api<{ user: User }>("/api/auth/login", { body: { identifier: identifier.trim(), password } });
      apply(res.user);
      return res.user;
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    apply(null);
  }, [apply]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, setUser: apply, refresh }),
    [user, status, login, logout, apply, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** The signed-in user; only call below RequireRole. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called without a signed-in user");
  return user;
}
