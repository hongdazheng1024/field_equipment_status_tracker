import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { ROLES, type AuthUser } from "./types.js";

// What we put inside the token. `sub` (subject) is the standard JWT claim for
// the user id; JWT requires it to be a string.
const claimsSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  username: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
});

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { username: user.username, displayName: user.displayName, role: user.role },
    config.JWT_SECRET,
    {
      subject: String(user.id),
      expiresIn: config.JWT_EXPIRES_IN_SECONDS,
      algorithm: "HS256",
    },
  );
}

/**
 * Returns the user inside a valid token, or null if the token is malformed,
 * has a bad signature, is expired, or has unexpected contents.
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    // Pinning the algorithm stops a token from choosing a weaker one (e.g. "none").
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    const claims = claimsSchema.parse(payload);
    return {
      id: Number(claims.sub),
      username: claims.username,
      displayName: claims.displayName,
      role: claims.role,
    };
  } catch {
    return null;
  }
}
