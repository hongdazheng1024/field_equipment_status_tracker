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
