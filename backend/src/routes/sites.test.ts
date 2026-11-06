import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, useTestDatabase } from "../../test/helpers.js";
import { createApp } from "../app.js";

const app = createApp();
useTestDatabase();

let token: string;
beforeAll(async () => {
  token = await loginAs(app, "olivia");
});

describe("GET /api/sites", () => {
  it("requires a login", async () => {
    const res = await request(app).get("/api/sites");
    expect(res.status).toBe(401);
  });

  it("returns every seeded site with per-status counts that add up", async () => {
    const res = await request(app).get("/api/sites").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["Desert Relay", "Harbor Depot", "North Ridge"]);
    for (const site of res.body.data) {
      const sumOfStatuses = Object.values<number>(site.counts).reduce((a, b) => a + b, 0);
      expect(sumOfStatuses).toBe(site.total);
      expect(site.staleCount).toBeLessThanOrEqual(site.total);
    }
    const grandTotal = res.body.data.reduce((sum: number, s: { total: number }) => sum + s.total, 0);
    expect(grandTotal).toBe(75);
  });

  it("agrees with the equipment list on stale and down counts", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const sites = await request(app).get("/api/sites").set(auth);
    const site = sites.body.data[0];

    const stale = await request(app).get(`/api/equipment?siteId=${site.id}&stale=true`).set(auth);
    const down = await request(app).get(`/api/equipment?siteId=${site.id}&status=DOWN`).set(auth);

    expect(stale.body.total).toBe(site.staleCount);
    expect(down.body.total).toBe(site.counts.DOWN);
  });

  it("lists the distinct equipment types, sorted", async () => {
    const res = await request(app).get("/api/sites").set("Authorization", `Bearer ${token}`);
    expect(res.body.types).toEqual(["Generator", "Radio", "Sensor", "Vehicle"]);
  });
});
