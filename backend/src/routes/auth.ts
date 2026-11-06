import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { signToken } from "../auth/token.js";
import type { AuthUser, Role } from "../auth/types.js";
import { pool } from "../db/pool.js";
import { AppError } from "../errors.js";

export const authRouter = Router();

const loginSchema = z.object({
  // `error` covers a missing/non-string field; `min` covers an empty one.
  username: z.string({ error: "Username is required" }).trim().min(1, "Username is required"),
  password: z.string({ error: "Password is required" }).min(1, "Password is required"),
});

// Compared against when the username doesn't exist, so a wrong username takes
// as long as a wrong password and response timing doesn't reveal which users exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

interface UserRow {
  user_id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
}

authRouter.post("/login", async (req, res) => {
  // A ZodError thrown here becomes a 400 VALIDATION_ERROR in errorHandler.
  const { username, password } = loginSchema.parse(req.body);

  const { rows } = await pool.query<UserRow>(
    "SELECT user_id, username, display_name, password_hash, role FROM users WHERE username = $1",
    [username],
  );
  const row = rows[0];
  const passwordOk = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);

  // Same error for unknown user and wrong password.
  if (!row || !passwordOk) {
    throw AppError.unauthorized("Invalid username or password");
  }

  const user: AuthUser = {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
  res.json({ token: signToken(user), user });
});

/** Lets the frontend restore a session (and check the token) after a reload. */
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
