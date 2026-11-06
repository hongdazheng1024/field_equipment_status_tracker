import { Router } from "express";
import { listEquipmentTypes, listSiteSummaries } from "../sites/repository.js";

export const sitesRouter = Router();

/**
 * Reference data the dashboard loads once (and re-fetches after a change):
 * sites with per-status counts for the sidebar and stat cards, plus the
 * equipment types for the type dropdown. Kept out of GET /api/equipment, which
 * runs on every filter/page change.
 */
sitesRouter.get("/", async (_req, res) => {
  const [sites, types] = await Promise.all([listSiteSummaries(new Date()), listEquipmentTypes()]);
  res.json({ data: sites, types });
});
