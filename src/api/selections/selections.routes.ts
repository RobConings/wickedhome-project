import { Router } from "express";
import { selectionEntityTypeSchema, selectionRefSchema } from "@/types/selections";
import { parse } from "../lib/http";
import { currentUser, requireUser } from "../lib/session";
import { addFavorite, getSelections, recordUse, removeFavorite } from "./selections.service";

/**
 * Favourites and recently used items for every picker. These are personal preferences, so every role
 * (children too) may change their own.
 */
export const selectionsRouter = Router();

selectionsRouter.use(requireUser);

selectionsRouter.get("/:entityType", async (req, res) => {
  const entityType = parse(selectionEntityTypeSchema, req.params.entityType);
  res.json(await getSelections(currentUser(req).id, entityType));
});

selectionsRouter.post("/favorites", async (req, res) => {
  await addFavorite(currentUser(req).id, parse(selectionRefSchema, req.body));
  res.status(204).end();
});

selectionsRouter.delete("/favorites/:entityType/:entityId", async (req, res) => {
  const ref = parse(selectionRefSchema, { entityType: req.params.entityType, entityId: req.params.entityId });
  await removeFavorite(currentUser(req).id, ref);
  res.status(204).end();
});

selectionsRouter.post("/recent", async (req, res) => {
  await recordUse(currentUser(req).id, parse(selectionRefSchema, req.body));
  res.status(204).end();
});
