import { Router } from "express";
import { z } from "zod";
import {
  scanQuerySchema,
  stockItemInputSchema,
  stockItemUpdateSchema,
  stockMovementInputSchema,
} from "@/features/inventory/types/inventory";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  addMovement,
  createStockItem,
  deleteStockItem,
  getProductStock,
  listStock,
  scanCode,
  updateStockItem,
} from "./inventory.service";

export const inventoryRouter = Router();

inventoryRouter.use(requireUser);

/** Setting up stock and thresholds. Using and adding stock (scanning) is open to everyone. */
const canManage = requireRole("owner", "adult");

const stockQuerySchema = z.object({ placeId: idSchema.optional(), productId: idSchema.optional() });

inventoryRouter.get("/stock", async (req, res) => {
  const query = parse(stockQuerySchema, req.query);
  res.json(await listStock(currentUser(req).householdId, query));
});

inventoryRouter.post("/stock", canManage, async (req, res) => {
  const input = parse(stockItemInputSchema, req.body);
  res.status(201).json(await createStockItem(currentUser(req), input));
});

inventoryRouter.put("/stock/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(stockItemUpdateSchema, req.body);
  res.json(await updateStockItem(currentUser(req), id, input));
});

inventoryRouter.delete("/stock/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteStockItem(currentUser(req).householdId, id);
  res.status(204).end();
});

inventoryRouter.post("/stock/:id/movements", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(stockMovementInputSchema, req.body);
  res.status(201).json(await addMovement(currentUser(req), id, input));
});

inventoryRouter.get("/products/:productId", async (req, res) => {
  const productId = parse(idSchema, req.params.productId);
  res.json(await getProductStock(currentUser(req).householdId, productId));
});

inventoryRouter.get("/scan", async (req, res) => {
  const { code } = parse(scanQuerySchema, req.query);
  res.json(await scanCode(currentUser(req).householdId, code));
});
