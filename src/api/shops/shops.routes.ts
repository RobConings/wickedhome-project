import { Router } from "express";
import { shopIngredientSearchInputSchema, shopInputSchema, shopListQuerySchema } from "@/features/shops/types/shops";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { createShop, deleteShop, getShop, getShopIcon, listShops, refreshShopIcon, setIngredientSearch, updateShop } from "./shops.service";
import "./shops.jobs";

export const shopsRouter = Router();

shopsRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

shopsRouter.get("/", async (req, res) => {
  const query = parse(shopListQuerySchema, req.query);
  res.json(await listShops(currentUser(req).householdId, query));
});

shopsRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getShop(currentUser(req).householdId, id));
});

// The shop's logo, found automatically on its website (see shop-icon.ts). Versioned URLs (`?v=`) come from
// `Shop.iconUrl`, so the browser may cache it for a week.
shopsRouter.get("/:id/icon", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const icon = await getShopIcon(currentUser(req).householdId, id);
  res.set({
    "Content-Type": icon.contentType,
    "Cache-Control": "private, max-age=604800",
    ETag: icon.etag,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  // An SVG opened directly must not run scripts or load anything.
  if (icon.contentType === "image/svg+xml") res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  res.send(icon.bytes);
});

shopsRouter.post("/:id/icon/refresh", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await refreshShopIcon(currentUser(req).householdId, id));
});

shopsRouter.post("/", canManage, async (req, res) => {
  const input = parse(shopInputSchema, req.body);
  res.status(201).json(await createShop(currentUser(req).householdId, input));
});

// Built-in shops: the service lets only the owner edit them.
shopsRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(shopInputSchema, req.body);
  res.json(await updateShop(currentUser(req), id, input));
});

// "Use for ingredient search": the household's own setting, so adults may switch built-in shops too.
shopsRouter.put("/:id/ingredient-search", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(shopIngredientSearchInputSchema, req.body);
  res.json(await setIngredientSearch(currentUser(req).householdId, id, input.enabled));
});

shopsRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteShop(currentUser(req), id);
  res.status(204).end();
});
