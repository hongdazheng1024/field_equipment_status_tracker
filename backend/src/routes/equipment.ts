import { Router } from "express";
import { getEquipment, listEquipment } from "../equipment/repository.js";
import { idParamsSchema, listQuerySchema } from "../equipment/schemas.js";
import { AppError } from "../errors.js";

export const equipmentRouter = Router();

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
