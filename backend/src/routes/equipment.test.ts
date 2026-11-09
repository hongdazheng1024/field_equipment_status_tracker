import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, useTestDatabase } from "../../test/helpers.js";
import { createApp } from "../app.js";
import { pool } from "../db/pool.js";

const app = createApp();
useTestDatabase();

let auth: { Authorization: string };
beforeAll(async () => {
  auth = { Authorization: `Bearer ${await loginAs(app, "omar")}` };
});

const list = (query = "") => request(app).get(`/api/equipment${query}`).set(auth);

interface Item {
  id: number;
  name: string;
  type: string;
  site: { id: number; name: string };
  status: string;
  isStale: boolean;
}

describe("GET /api/equipment", () => {
  it("requires a login", async () => {
    const res = await request(app).get("/api/equipment");
    expect(res.status).toBe(401);
  });

  it("returns the first 25 items sorted by name, with the total", async () => {
    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 25, total: 75 });
    expect(res.body.data).toHaveLength(25);
    const names = res.body.data.map((i: Item) => i.name);
    expect(names).toEqual([...names].sort());
    expect(res.body.data[0]).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
      type: expect.any(String),
      site: { id: expect.any(Number), name: expect.any(String) },
      status: expect.any(String),
      lastCheckedAt: expect.any(String),
      lastCheckedBy: expect.toBeOneOf([null, { id: expect.any(Number), displayName: expect.any(String) }]),
      isStale: expect.any(Boolean),
      version: expect.any(Number),
    });
  });

  it("pages through every item exactly once", async () => {
    const pages = await Promise.all([1, 2, 3, 4].map((p) => list(`?page=${p}&sort=status`)));
    const ids = pages.flatMap((p) => p.body.data.map((i: Item) => i.id));

    expect(ids).toHaveLength(75);
    expect(new Set(ids).size).toBe(75);
    expect(pages[3]!.body.data).toEqual([]); // past the end: empty, but total still reported
    expect(pages[3]!.body.total).toBe(75);
  });

  it("filters by site", async () => {
    const res = await list("?siteId=1&pageSize=100");
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data.every((i: Item) => i.site.id === 1)).toBe(true);
  });

  it("filters by several statuses", async () => {
    const res = await list("?status=DOWN,DEGRADED&pageSize=100");
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data.every((i: Item) => ["DOWN", "DEGRADED"].includes(i.status))).toBe(true);
  });

  it("filters by type", async () => {
    const res = await list("?type=Radio&pageSize=100");
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data.every((i: Item) => i.type === "Radio")).toBe(true);
  });

  it("filters stale and not-stale, which together cover everything", async () => {
    const stale = await list("?stale=true&pageSize=100");
    const fresh = await list("?stale=false&pageSize=100");

    expect(stale.body.data.every((i: Item) => i.isStale)).toBe(true);
    expect(fresh.body.data.every((i: Item) => !i.isStale)).toBe(true);
    expect(stale.body.total + fresh.body.total).toBe(75);
  });

  it("searches name and type case-insensitively", async () => {
    const byName = await list("?q=gen-nr&pageSize=100");
    expect(byName.body.total).toBeGreaterThan(0);
    expect(byName.body.data.every((i: Item) => i.name.startsWith("GEN-NR-"))).toBe(true);

    const byType = await list("?q=vehic&pageSize=100");
    expect(byType.body.data.every((i: Item) => i.type === "Vehicle")).toBe(true);
  });

  it("treats % in a search as a literal character, not a wildcard", async () => {
    const res = await list(`?q=${encodeURIComponent("%")}`);
    expect(res.body.total).toBe(0);
  });

  it("combines filters", async () => {
    const res = await list("?siteId=2&status=OPERATIONAL&q=sen&pageSize=100");
    expect(
      res.body.data.every((i: Item) => i.site.id === 2 && i.status === "OPERATIONAL" && i.type === "Sensor"),
    ).toBe(true);
  });

  it.each([
    ["an unknown status", "?status=BROKEN", "status"],
    ["a page size over 100", "?pageSize=101", "pageSize"],
    ["a non-numeric site", "?siteId=abc", "siteId"],
    ["an unknown sort field", "?sort=password_hash", "sort"],
  ])("rejects %s with 400", async (_label, query, field) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    // e.g. "status.0" for the first bad entry in a status list.
    expect(res.body.error.details[0].path.split(".")[0]).toBe(field);
  });
});

describe("GET /api/equipment/:id", () => {
  it("returns one item", async () => {
    const first = (await list()).body.data[0];
    const res = await request(app).get(`/api/equipment/${first.id}`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(first);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/equipment/999999").set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/equipment/abc").set(auth);
    expect(res.status).toBe(400);
  });

  it("hides soft-deleted items from detail and list", async () => {
    const target = (await list()).body.data[0];
    await pool.query("UPDATE equipment SET deleted_at = now() WHERE equip_id = $1", [target.id]);

    const detail = await request(app).get(`/api/equipment/${target.id}`).set(auth);
    const all = await list("?pageSize=100");

    expect(detail.status).toBe(404);
    expect(all.body.total).toBe(74);
    expect(all.body.data.some((i: Item) => i.id === target.id)).toBe(false);
  });
});
