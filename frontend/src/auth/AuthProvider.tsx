import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, setAuthToken, setUnauthorizedHandler } from "../api/client";
import { api } from "../api/endpoints";
import type { AuthUser } from "../api/types";
import { AuthContext, type AuthContextValue, type LogoutReason } from "./AuthContext";
import { loadSession, saveSession } from "./session";

/** Reads the saved session and hands its token to the API client. */
function restoreSession(): AuthUser | null {
  const session = loadSession();
  setAuthToken(session?.token ?? null);
  return session?.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Lazy initial state: runs once, before the first render, so the token is
  // already set when the dashboard's first requests go out.
  const [user, setUser] = useState<AuthUser | null>(restoreSession);
  const [logoutReason, setLogoutReason] = useState<LogoutReason>(null);

  const logout = useCallback(
    (reason: LogoutReason = null) => {
      saveSession(null);
      setAuthToken(null);
      // Drop cached data so the next person on this device can't see it.
      queryClient.clear();
      setLogoutReason(reason);
      setUser(null);
    },
    [queryClient],
  );

  const login = useCallback(async (username: string, password: string) => {
    const { token, user } = await api.login(username, password);
    saveSession({ token, user });
    setAuthToken(token);
    setLogoutReason(null);
    setUser(user);
  }, []);

  // Any request rejected with 401 while logged in means the token expired.
  useEffect(() => {
    setUnauthorizedHandler(() => logout("expired"));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // On page load, check a restored token is still valid. Only a 401 logs the
  // user out; a network error keeps them in, since being offline is normal
  // in the field.
  // `logout` never changes, so this runs once on mount; after that the 401
  // handler above covers expiry.
  useEffect(() => {
    if (!loadSession()) return;
    api.me().catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) logout("expired");
    });
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, logoutReason, login, logout }),
    [user, logoutReason, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
