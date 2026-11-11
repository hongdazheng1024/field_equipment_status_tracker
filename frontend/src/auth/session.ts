import type { AuthUser } from "../api/types";

// The token and user are kept in localStorage so a reload, including one
// while offline in the field, doesn't log the user out.
// Trade-off: any script on the page can read localStorage, so an XSS bug
// could steal the token. An httpOnly cookie would avoid that (see README).

const STORAGE_KEY = "fest.session";

export interface Session {
  token: string;
  user: AuthUser;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return parsed.token && parsed.user ? (parsed as Session) : null;
  } catch {
    // Storage blocked (private mode) or corrupted: behave as logged out.
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not fatal: the session just won't survive a reload.
  }
}
