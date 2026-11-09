import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, useTestDatabase } from "../../test/helpers.js";
import { createApp } from "../app.js";
import { pool } from "../db/pool.js";

// Adding and removing equipment: supervisor only.
const app = createApp();
useTestDatabase();

let supervisor: { Authorization: string };
let operator: { Authorization: string };
beforeAll(async () => {
  supervisor = { Authorization: `Bearer ${await loginAs(app, "sara")}` };
  operator = { Authorization: `Bearer ${await loginAs(app, "olivia")}` };
});

const newItem = { name: "GEN-NR-900", type: "Generator", siteId: 1, status: "OPERATIONAL" };

async function firstItem(): Promise<{ id: number; version: number }> {
  return (await request(app).get("/api/equipment").set(supervisor)).body.data[0];
}

describe("POST /api/equipment", () => {
  it("lets a supervisor add an item, checked as of now", async () => {
    const res = await request(app).post("/api/equipment").set(supervisor).send(newItem);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/equipment/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      name: "GEN-NR-900",
      type: "Generator",
      site: { id: 1 },
      status: "OPERATIONAL",
      version: 1,
      isStale: false,
      lastCheckedBy: null,
    });

    const list = await request(app).get("/api/equipment?q=GEN-NR-900").set(operator);
    expect(list.body.total).toBe(1);
  });

  it("forbids operators with 403", async () => {
    const res = await request(app).post("/api/equipment").set(operator).send(newItem);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects an unknown site with 400 on siteId", async () => {
    const res = await request(app).post("/api/equipment").set(supervisor).send({ ...newItem, siteId: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "siteId", message: "Site 999 does not exist" }]);
  });

  it("rejects blank names and missing fields", async () => {
    const res = await request(app).post("/api/equipment").set(supervisor).send({ name: "  ", siteId: 1 });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "type", "status"]));
  });
});

describe("DELETE /api/equipment/:id", () => {
  it("forbids operators with 403", async () => {
    const item = await firstItem();
    const res = await request(app).delete(`/api/equipment/${item.id}?version=${item.version}`).set(operator);
    expect(res.status).toBe(403);
  });

  it("requires the version", async () => {
    const item = await firstItem();
    const res = await request(app).delete(`/api/equipment/${item.id}`).set(supervisor);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("version");
  });

  it("refuses to delete an item that changed since it was loaded", async () => {
    const item = await firstItem();
    await request(app)
      .post(`/api/equipment/${item.id}/status-changes`)
      .set(operator)
      .send({ status: "DOWN", reason: "Just broke", version: item.version });

    const res = await request(app).delete(`/api/equipment/${item.id}?version=${item.version}`).set(supervisor);

    expect(res.status).toBe(409);
    expect(res.body.error.details.current).toMatchObject({ status: "DOWN", version: item.version + 1 });
  });

  it("soft-deletes: hidden from the app, history kept in the database", async () => {
    const item = await firstItem();
    const res = await request(app).delete(`/api/equipment/${item.id}?version=${item.version}`).set(supervisor);

    expect(res.status).toBe(204);
    expect((await request(app).get(`/api/equipment/${item.id}`).set(supervisor)).status).toBe(404);

    const { rows } = await pool.query(
      "SELECT deleted_at, (SELECT count(*)::int FROM equipment_status_history WHERE equip_id = $1) AS history FROM equipment WHERE equip_id = $1",
      [item.id],
    );
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].history).toBeGreaterThan(0);

    const again = await request(app).delete(`/api/equipment/${item.id}?version=${item.version + 1}`).set(supervisor);
    expect(again.status).toBe(404);
  });
});
