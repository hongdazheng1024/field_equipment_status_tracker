import type { RequestHandler } from "express";
import { AppError } from "../errors.js";
import { verifyToken } from "./token.js";
import type { Role } from "./types.js";

/**
 * 401 unless the request carries a valid `Authorization: Bearer <token>`.
 * On success sets `req.user`, which is the only trusted source of "who did
 * this" (never a user id from the request body).
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const match = header?.match(/^Bearer (.+)$/);
  if (!match) {
    next(AppError.unauthorized("Missing bearer token"));
    return;
  }

  const user = verifyToken(match[1]!);
  if (!user) {
    next(AppError.unauthorized("Invalid or expired token"));
    return;
  }

  req.user = user;
  next();
};

/**
 * 403 unless the authenticated user has one of `roles`. Must run after
 * `requireAuth`: 401 = "who are you?", 403 = "known, but not allowed".
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`Requires role: ${roles.join(" or ")}`));
      return;
    }
    next();
  };
}
