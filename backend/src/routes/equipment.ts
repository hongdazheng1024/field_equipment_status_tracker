import { Router } from "express";
import { requireRole } from "../auth/middleware.js";
import {
  createEquipment,
  getEquipment,
  listEquipment,
  siteExists,
  softDeleteEquipment,
} from "../equipment/repository.js";
import {
  createEquipmentBodySchema,
  deleteQuerySchema,
  historyQuerySchema,
  idParamsSchema,
  listQuerySchema,
  statusChangeBodySchema,
} from "../equipment/schemas.js";
import { changeStatus, listStatusChanges } from "../equipment/statusChanges.js";
import { AppError } from "../errors.js";

export const equipmentRouter = Router();

/** 409 carrying the item's latest state, so the UI can show it and let the user retry. */
async function versionConflict(id: number): Promise<AppError> {
  const current = await getEquipment(id, new Date());
  if (!current) return AppError.notFound(`Equipment ${id} not found`);
  const who = current.lastCheckedBy?.displayName ?? "another user";
  return AppError.conflict(`This equipment was changed by ${who} since you loaded it`, { current });
}

/** GET /api/equipment?q&siteId&type&status&stale&sort&order&page&pageSize */
equipmentRouter.get("/", async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const { items, total } = await listEquipment(query, new Date());
  res.json({ data: items, page: query.page, pageSize: query.pageSize, total });
});

equipmentRouter.get("/:id", async (req, res) => {
  const { id } = idParamsSchema.parse(req.params);
  const equipment = await getEquipment(id, new Date());
  if (!equipment) throw AppError.notFound(`Equipment ${id} not found`);
  res.json({ data: equipment });
});

/** Supervisor only: add an item. */
equipmentRouter.post("/", requireRole("SUPERVISOR"), async (req, res) => {
  const body = createEquipmentBodySchema.parse(req.body);
  if (!(await siteExists(body.siteId))) {
    throw new AppError(400, "VALIDATION_ERROR", "Request validation failed", [
      { path: "siteId", message: `Site ${body.siteId} does not exist` },
    ]);
  }
  const id = await createEquipment(body);
  const equipment = await getEquipment(id, new Date());
  res.status(201).location(`/api/equipment/${id}`).json({ data: equipment });
});

/** Supervisor only: soft-delete an item. Needs the current version, like any write. */
equipmentRouter.delete("/:id", requireRole("SUPERVISOR"), async (req, res) => {
  const { id } = idParamsSchema.parse(req.params);
  const { version } = deleteQuerySchema.parse(req.query);

  const result = await softDeleteEquipment(id, version);
  if (result === "not_found") throw AppError.notFound(`Equipment ${id} not found`);
  if (result === "version_conflict") throw await versionConflict(id);
  res.status(204).end();
});

/** Any logged-in user: change status (or confirm it unchanged) with a reason. */
equipmentRouter.post("/:id/status-changes", async (req, res) => {
  const { id } = idParamsSchema.parse(req.params);
  const body = statusChangeBodySchema.parse(req.body);

  // req.user is set by requireAuth; the acting user never comes from the body.
  const result = await changeStatus(id, body, req.user!);
  switch (result.kind) {
    case "not_found":
      throw AppError.notFound(`Equipment ${id} not found`);
    case "version_conflict":
      throw await versionConflict(id);
    case "change_id_taken":
      throw AppError.conflict(`changeId ${body.changeId} was already used for a different item`);
    case "applied":
    case "replayed": {
      const equipment = await getEquipment(id, new Date());
      // 201 for a new change; 200 when an identical resend is recognised.
      res.status(result.kind === "applied" ? 201 : 200).json({ data: { equipment, change: result.change } });
    }
  }
});

equipmentRouter.get("/:id/status-changes", async (req, res) => {
  const { id } = idParamsSchema.parse(req.params);
  const { page, pageSize } = historyQuerySchema.parse(req.query);
  const history = await listStatusChanges(id, page, pageSize);
  if (!history) throw AppError.notFound(`Equipment ${id} not found`);
  res.json({ data: history.items, page, pageSize, total: history.total });
});
