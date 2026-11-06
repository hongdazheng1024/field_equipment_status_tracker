import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors.js";
import { requireAuth, requireRole } from "./middleware.js";
import { signToken } from "./token.js";
import type { AuthUser } from "./types.js";

const operator: AuthUser = { id: 1, username: "olivia", displayName: "Olivia Ortiz", role: "OPERATOR" };
const supervisor: AuthUser = { id: 3, username: "sara", displayName: "Sara Kim", role: "SUPERVISOR" };

/** Runs a middleware against a fake request; returns the req and what next() got. */
function run(middleware: (req: Request, res: Response, next: NextFunction) => void, req: Partial<Request>) {
  const next = vi.fn();
  middleware(req as Request, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return { req, error: next.mock.calls[0]![0] as AppError | undefined };
}

describe("requireRole", () => {
  it("lets a user with an allowed role through", () => {
    const { error } = run(requireRole("SUPERVISOR"), { user: supervisor });
    expect(error).toBeUndefined();
  });

  it("rejects a user without the role with 403", () => {
    const { error } = run(requireRole("SUPERVISOR"), { user: operator });
    expect(error).toBeInstanceOf(AppError);
    expect(error?.status).toBe(403);
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("accepts any of several roles", () => {
    const { error } = run(requireRole("OPERATOR", "SUPERVISOR"), { user: operator });
    expect(error).toBeUndefined();
  });

  it("returns 401, not 403, when there is no user at all", () => {
    const { error } = run(requireRole("SUPERVISOR"), {});
    expect(error?.status).toBe(401);
  });
});

describe("requireAuth", () => {
  it("sets req.user from a valid bearer token", () => {
    const { req, error } = run(requireAuth, { headers: { authorization: `Bearer ${signToken(operator)}` } });
    expect(error).toBeUndefined();
    expect(req.user).toEqual(operator);
  });

  it.each([
    ["no header", undefined],
    ["wrong scheme", `Basic ${signToken(operator)}`],
    ["garbage token", "Bearer not-a-jwt"],
    ["tampered token", `Bearer ${signToken(operator)}x`],
  ])("rejects %s with 401", (_label, authorization) => {
    const { req, error } = run(requireAuth, { headers: { authorization } });
    expect(error?.status).toBe(401);
    expect(req.user).toBeUndefined();
  });
});
