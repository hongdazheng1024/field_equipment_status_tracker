import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll } from "vitest";
import { pool } from "../src/db/pool.js";
import { reset } from "../src/db/reset.js";
import { SEED_PASSWORD } from "../src/db/seed.js";

/**
 * For integration test files that touch the database: start from freshly
 * seeded data (so files don't depend on each other's writes) and close the
 * pool at the end.
 */
export function useTestDatabase() {
  beforeAll(() => reset());
  afterAll(() => pool.end());
}

/** Logs in as a seeded user and returns the bearer token. */
export async function loginAs(app: Express, username: "olivia" | "omar" | "sara"): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ username, password: SEED_PASSWORD });
  if (res.status !== 200) throw new Error(`Login as ${username} failed: ${res.status}`);
  return res.body.token;
}
