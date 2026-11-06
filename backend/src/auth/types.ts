export const ROLES = ["OPERATOR", "SUPERVISOR"] as const;
export type Role = (typeof ROLES)[number];

/** The identity attached to every authenticated request. */
export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

// Lets route handlers use `req.user` with full typing. It is only set by
// `requireAuth`, so it is optional at the type level.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
