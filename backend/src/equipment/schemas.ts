import { z } from "zod";
import { STATUSES } from "./rules.js";

// Postgres INT max; larger ids would otherwise reach the DB and fail as a 500.
const MAX_INT = 2_147_483_647;
const id = z.coerce.number().int().positive().max(MAX_INT);

export const SORT_FIELDS = ["name", "lastCheckedAt", "status", "site"] as const;

/** Query string for GET /api/equipment. Every field is optional. */
export const listQuerySchema = z.object({
  // Empty strings (e.g. a cleared search box) are treated as "not set".
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  siteId: id.optional(),
  type: z.string().trim().max(50).optional().transform((v) => v || undefined),
  // Comma-separated, e.g. status=DOWN,DEGRADED
  status: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(STATUSES)).min(1))
    .optional(),
  stale: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sort: z.enum(SORT_FIELDS).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamsSchema = z.object({ id });

// The version the client last saw. Every write sends it back; if the row has
// moved on since, the write is rejected with 409 instead of overwriting.
const version = z.coerce.number().int().positive().max(MAX_INT);

/** Body for POST /api/equipment/:id/status-changes. */
export const statusChangeBodySchema = z.object({
  status: z.enum(STATUSES),
  reason: z.string().trim().min(1, "Reason is required").max(500),
  version,
  // Optional client-generated id. Lets an offline queue resend safely: the
  // same changeId is only ever applied once.
  changeId: z.uuid().optional(),
});
export type StatusChangeBody = z.infer<typeof statusChangeBodySchema>;

/** Body for POST /api/equipment (supervisor only). */
export const createEquipmentBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  type: z.string().trim().min(1, "Type is required").max(50),
  siteId: id,
  status: z.enum(STATUSES),
});
export type CreateEquipmentBody = z.infer<typeof createEquipmentBodySchema>;

/** Query for DELETE /api/equipment/:id?version=N (a DELETE body is unreliable across clients). */
export const deleteQuerySchema = z.object({ version });

/** Query for GET /api/equipment/:id/status-changes. */
export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
