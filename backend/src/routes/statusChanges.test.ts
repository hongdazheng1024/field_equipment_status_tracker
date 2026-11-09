import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { loginAs, useTestDatabase } from "../../test/helpers.js";
import { createApp } from "../app.js";
import { pool } from "../db/pool.js";

const app = createApp();
useTestDatabase();

let omar: { Authorization: string };
let olivia: { Authorization: string };
beforeAll(async () => {
  omar = { Authorization: `Bearer ${await loginAs(app, "omar")}` };
  olivia = { Authorization: `Bearer ${await loginAs(app, "olivia")}` };
});

interface Item {
  id: number;
  status: string;
  version: number;
  isStale: boolean;
  lastCheckedAt: string;
  lastCheckedBy: { displayName: string } | null;
}

/** Fetches a live item matching `query` (e.g. "?stale=true"), at index `n`. */
async function pickItem(query = "", n = 0): Promise<Item> {
  const res = await request(app).get(`/api/equipment${query}`).set(omar);
  return res.body.data[n];
}

const getItem = async (id: number): Promise<Item> =>
  (await request(app).get(`/api/equipment/${id}`).set(omar)).body.data;

const historyCount = async (id: number): Promise<number> =>
  (await pool.query("SELECT count(*)::int AS n FROM equipment_status_history WHERE equip_id = $1", [id])).rows[0].n;

const postChange = (id: number, body: object, auth = omar) =>
  request(app).post(`/api/equipment/${id}/status-changes`).set(auth).send(body);

describe("POST /api/equipment/:id/status-changes", () => {
  it("updates status, last-checked time and version, and records who and why", async () => {
    const item = await pickItem("?stale=true&status=OPERATIONAL");
    const before = await historyCount(item.id);

    const res = await postChange(item.id, { status: "DOWN", reason: "Will not power on", version: item.version });

    expect(res.status).toBe(201);
    const { equipment, change } = res.body.data;
    expect(equipment).toMatchObject({
      id: item.id,
      status: "DOWN",
      version: item.version + 1,
      isStale: false, // checking an item clears the stale flag
      lastCheckedBy: { displayName: "Omar Nasser" },
    });
    expect(Date.now() - Date.parse(equipment.lastCheckedAt)).toBeLessThan(60_000);
    expect(change).toMatchObject({
      equipmentId: item.id,
      oldStatus: "OPERATIONAL",
      newStatus: "DOWN",
      reason: "Will not power on",
      user: { displayName: "Omar Nasser" },
    });
    expect(change.changedAt).toBe(equipment.lastCheckedAt);
    expect(await historyCount(item.id)).toBe(before + 1);
  });

  it("allows confirming the same status as a check-in", async () => {
    const item = await pickItem("?status=DEGRADED");
    const res = await postChange(item.id, { status: "DEGRADED", reason: "Still degraded", version: item.version });

    expect(res.status).toBe(201);
    expect(res.body.data.change).toMatchObject({ oldStatus: "DEGRADED", newStatus: "DEGRADED" });
    expect(res.body.data.equipment.version).toBe(item.version + 1);
  });

  it("rejects an outdated version with 409 and the current state, changing nothing", async () => {
    const item = await pickItem("", 1);
    await postChange(item.id, { status: "IN_MAINTENANCE", reason: "Olivia got there first", version: item.version }, olivia);
    const before = await historyCount(item.id);

    // Omar still has the version he loaded before Olivia's change.
    const res = await postChange(item.id, { status: "OPERATIONAL", reason: "Looks fine", version: item.version });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.message).toContain("Olivia Ortiz");
    expect(res.body.error.details.current).toMatchObject({ status: "IN_MAINTENANCE", version: item.version + 1 });
    expect(await historyCount(item.id)).toBe(before);
    expect((await getItem(item.id)).status).toBe("IN_MAINTENANCE");
  });

  it("lets exactly one of two simultaneous edits win", async () => {
    const item = await pickItem("", 2);

    const [a, b] = await Promise.all([
      postChange(item.id, { status: "DOWN", reason: "Omar's edit", version: item.version }, omar),
      postChange(item.id, { status: "DEGRADED", reason: "Olivia's edit", version: item.version }, olivia),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    expect((await getItem(item.id)).status).toBe(winner.body.data.equipment.status);
    expect((await getItem(item.id)).version).toBe(item.version + 1);
  });

  it("applies a resent changeId only once and returns the original change", async () => {
    const item = await pickItem("", 3);
    const body = { status: "DOWN", reason: "Queued while offline", version: item.version, changeId: randomUUID() };

    const first = await postChange(item.id, body);
    const resend = await postChange(item.id, body);

    expect(first.status).toBe(201);
    expect(resend.status).toBe(200);
    expect(resend.body.data.change).toEqual(first.body.data.change);
    expect((await getItem(item.id)).version).toBe(item.version + 1);
  });

  it("handles the same queued update arriving twice at once", async () => {
    const item = await pickItem("", 4);
    const body = { status: "DOWN", reason: "Double sync", version: item.version, changeId: randomUUID() };

    const results = await Promise.all([postChange(item.id, body), postChange(item.id, body)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((await getItem(item.id)).version).toBe(item.version + 1);
  });

  it("rejects a changeId already used for a different item", async () => {
    const [x, y] = [await pickItem("", 5), await pickItem("", 6)];
    const changeId = randomUUID();
    await postChange(x.id, { status: "DOWN", reason: "First", version: x.version, changeId });

    const res = await postChange(y.id, { status: "DOWN", reason: "Reused id", version: y.version, changeId });
    expect(res.status).toBe(409);
  });

  it("takes the acting user from the token, ignoring any user in the body", async () => {
    const item = await pickItem("", 7);
    const res = await postChange(item.id, { status: "DOWN", reason: "Spoof attempt", version: item.version, userId: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.change.user.displayName).toBe("Omar Nasser");
  });

  it.each([
    ["an empty reason", { status: "DOWN", reason: "   ", version: 1 }, "reason"],
    ["a missing version", { status: "DOWN", reason: "x" }, "version"],
    ["an unknown status", { status: "BROKEN", reason: "x", version: 1 }, "status"],
    ["a malformed changeId", { status: "DOWN", reason: "x", version: 1, changeId: "abc" }, "changeId"],
  ])("rejects %s with 400", async (_label, body, field) => {
    const item = await pickItem();
    const res = await postChange(item.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
  });

  it("returns 404 for unknown equipment", async () => {
    const res = await postChange(999999, { status: "DOWN", reason: "x", version: 1 });
    expect(res.status).toBe(404);
  });

  it("requires a login", async () => {
    const res = await request(app).post("/api/equipment/1/status-changes").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/equipment/:id/status-changes", () => {
  it("lists changes newest first with who, when, old/new status and reason", async () => {
    const item = await pickItem("", 10);
    await postChange(item.id, { status: "DOWN", reason: "Step 1", version: item.version });
    await postChange(item.id, { status: "OPERATIONAL", reason: "Step 2", version: item.version + 1 }, olivia);

    const res = await request(app).get(`/api/equipment/${item.id}/status-changes`).set(omar);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(await historyCount(item.id));
    expect(res.body.data[0]).toMatchObject({ newStatus: "OPERATIONAL", reason: "Step 2", user: { displayName: "Olivia Ortiz" } });
    expect(res.body.data[1]).toMatchObject({ oldStatus: item.status, newStatus: "DOWN", reason: "Step 1" });
    const times = res.body.data.map((c: { changedAt: string }) => Date.parse(c.changedAt));
    expect(times).toEqual([...times].sort((p, q) => q - p));
  });

  it("paginates", async () => {
    const item = await pickItem("", 10);
    const res = await request(app).get(`/api/equipment/${item.id}/status-changes?pageSize=1&page=2`).set(omar);

    expect(res.body).toMatchObject({ page: 2, pageSize: 1 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reason).toBe("Step 1");
  });

  it("returns 404 for unknown equipment", async () => {
    const res = await request(app).get("/api/equipment/999999/status-changes").set(omar);
    expect(res.status).toBe(404);
  });
});
