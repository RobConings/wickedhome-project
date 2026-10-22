import { Router } from "express";
import { z } from "zod";
import {
  linkPreviewInputSchema,
  productAlternativeInputSchema,
  productInputSchema,
  productQuerySchema,
  productShopLinkInputSchema,
  restockInputSchema,
  shoppingItemCreateSchema,
  shoppingItemQuerySchema,
  shoppingItemUpdateSchema,
  shoppingListInputSchema,
  stapleInputSchema,
  type ShoppingItemUpdateResult,
} from "@/features/shopping/types/shopping";
import { idSchema } from "@/types/common";
import { findRestockTarget, restockFromShoppingItem } from "../inventory/inventory.service";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { loadBarcodeImage, lookupBarcode } from "./barcode-lookup.service";
import {
  createItem,
  createList,
  createProduct,
  createStaple,
  deleteItem,
  deleteList,
  deleteProduct,
  deleteProductLink,
  deleteStaple,
  getLinkPreview,
  getProduct,
  getShoppingOverview,
  linkAlternative,
  listItems,
  listProducts,
  unlinkAlternative,
  updateItem,
  updateList,
  updateProduct,
  updateStaple,
  upsertProductLink,
} from "./shopping.service";
import "./shopping.jobs";

export const shoppingRouter = Router();

shoppingRouter.use(requireUser);

/** Lists, staples and the product catalogue. Children add items and tick them off (see the service). */
const canManage = requireRole("owner", "adult");

/** A typed or scanned barcode: digits, as printed (normalised and check-digit-checked by the service). */
const barcodeParamSchema = z.string().trim().regex(/^\d{6,14}$/);

shoppingRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  res.json(await getShoppingOverview(user.householdId, user.locale));
});

// Items ----------------------------------------------------------------------------------------------------

shoppingRouter.get("/items", async (req, res) => {
  const query = parse(shoppingItemQuerySchema, req.query);
  const user = currentUser(req);
  res.json(await listItems(user.householdId, query, user.locale));
});

shoppingRouter.post("/items", async (req, res) => {
  const input = parse(shoppingItemCreateSchema, req.body);
  res.status(201).json(await createItem(currentUser(req), input));
});

shoppingRouter.patch("/items/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(shoppingItemUpdateSchema, req.body);
  const user = currentUser(req);
  const { item, justBought } = await updateItem(user, id, input);
  const restock = justBought ? await findRestockTarget(user.householdId, item) : null;
  res.json({ item, restock } satisfies ShoppingItemUpdateResult);
});

shoppingRouter.delete("/items/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteItem(currentUser(req), id);
  res.status(204).end();
});

/** After buying: add the item's quantity to a stock item (Inventory). */
shoppingRouter.post("/items/:id/restock", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(restockInputSchema, req.body);
  await restockFromShoppingItem(currentUser(req), id, input);
  res.status(204).end();
});

shoppingRouter.post("/link-preview", async (req, res) => {
  const { url } = parse(linkPreviewInputSchema, req.body);
  res.json(await getLinkPreview(currentUser(req).householdId, url));
});

// Lists ----------------------------------------------------------------------------------------------------

shoppingRouter.post("/lists", canManage, async (req, res) => {
  const input = parse(shoppingListInputSchema, req.body);
  res.status(201).json(await createList(currentUser(req).householdId, input));
});

shoppingRouter.put("/lists/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(shoppingListInputSchema, req.body);
  res.json(await updateList(currentUser(req).householdId, id, input));
});

shoppingRouter.delete("/lists/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteList(currentUser(req).householdId, id);
  res.status(204).end();
});

// Staples --------------------------------------------------------------------------------------------------

shoppingRouter.post("/staples", canManage, async (req, res) => {
  const input = parse(stapleInputSchema, req.body);
  res.status(201).json(await createStaple(currentUser(req).householdId, input));
});

shoppingRouter.put("/staples/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(stapleInputSchema, req.body);
  res.json(await updateStaple(currentUser(req).householdId, id, input));
});

shoppingRouter.delete("/staples/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteStaple(currentUser(req).householdId, id);
  res.status(204).end();
});

// Products -------------------------------------------------------------------------------------------------

shoppingRouter.get("/products", async (req, res) => {
  const query = parse(productQuerySchema, req.query);
  res.json(await listProducts(currentUser(req).householdId, query));
});

shoppingRouter.get("/products/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getProduct(currentUser(req).householdId, id));
});

shoppingRouter.post("/products", canManage, async (req, res) => {
  const input = parse(productInputSchema, req.body);
  res.status(201).json(await createProduct(currentUser(req).householdId, input));
});

shoppingRouter.put("/products/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(productInputSchema, req.body);
  res.json(await updateProduct(currentUser(req).householdId, id, input));
});

shoppingRouter.delete("/products/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteProduct(currentUser(req).householdId, id);
  res.status(204).end();
});

shoppingRouter.put("/products/:id/links", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(productShopLinkInputSchema, req.body);
  res.json(await upsertProductLink(currentUser(req).householdId, id, input));
});

shoppingRouter.delete("/products/:id/links/:shopId", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const shopId = parse(idSchema, req.params.shopId);
  res.json(await deleteProductLink(currentUser(req).householdId, id, shopId));
});

// Alternatives: products that share one stock (product-alternatives.ts).

shoppingRouter.put("/products/:id/alternative", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(productAlternativeInputSchema, req.body);
  res.json(await linkAlternative(currentUser(req), id, input));
});

shoppingRouter.delete("/products/:id/alternative", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await unlinkAlternative(currentUser(req).householdId, id));
});

// Barcode auto-fill (barcode-lookup.service.ts). Read-only, so open to everyone (a child scanning wants to
// know what something is); the limits are per household and per server.

shoppingRouter.get("/barcode/:code", async (req, res) => {
  const user = currentUser(req);
  res.json(await lookupBarcode(user.householdId, parse(barcodeParamSchema, req.params.code), user.locale));
});

shoppingRouter.get("/barcode/:code/image", async (req, res) => {
  const image = await loadBarcodeImage(parse(barcodeParamSchema, req.params.code));
  res.set({
    "Content-Type": image.contentType,
    "Cache-Control": "private, max-age=604800",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  // res.send adds an ETag and answers 304 when the browser's copy is still current.
  res.send(image.bytes);
});
