import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { pool } from "../db/pool.js";
import { SEED_PASSWORD } from "../db/seed.js";

// Integration test: real Express app + real (test) Postgres, seeded by globalSetup.
const app = createApp();

afterAll(() => pool.end());

describe("POST /api/auth/login", () => {
  it("returns a token and the user for valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "sara", password: SEED_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: expect.any(Number), username: "sara", displayName: "Sara Kim", role: "SUPERVISOR" });
    expect(res.body.user).not.toHaveProperty("password_hash");
  });

  it.each([
    ["wrong password", { username: "sara", password: "nope" }],
    ["unknown user", { username: "nobody", password: SEED_PASSWORD }],
  ])("returns the same 401 for %s", async (_label, body) => {
    const res = await request(app).post("/api/auth/login").send(body);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Invalid username or password" } });
  });

  it("returns 400 with field details when fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "  " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: "username", message: "Username is required" },
        { path: "password", message: "Password is required" },
      ]),
    );
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the logged-in user with a token", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "olivia", password: SEED_PASSWORD });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(login.body.user);
  });
});
