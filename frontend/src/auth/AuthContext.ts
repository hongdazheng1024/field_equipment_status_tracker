import { createContext, useContext } from "react";
import type { AuthUser } from "../api/types";

export type LogoutReason = "expired" | null;

export interface AuthContextValue {
  user: AuthUser | null;
  /** Why the last logout happened, so the login page can explain it. */
  logoutReason: LogoutReason;
  login: (username: string, password: string) => Promise<void>;
  logout: (reason?: LogoutReason) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
