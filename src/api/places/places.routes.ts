import { Router } from "express";
import { z } from "zod";
import { floorInputSchema, floorPlanInputSchema, placeInputSchema } from "@/features/places/types/places";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  createFloor,
  createPlace,
  createStarterFloors,
  deleteFloor,
  deletePlace,
  getFloorPlan,
  getPlaceDetail,
  getPlacesOverview,
  listPlaces,
  saveFloorPlan,
  updateFloor,
  updatePlace,
} from "./places.service";

export const placesRouter = Router();

placesRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

const starterInputSchema = z.object({
  indoor: z.string().trim().min(1).max(60),
  outdoor: z.string().trim().min(1).max(60),
});

/** Floors and their places, for the places page. */
placesRouter.get("/", async (req, res) => {
  res.json(await getPlacesOverview(currentUser(req).householdId));
});

/** Every place as a flat list, for pickers and other features. */
placesRouter.get("/all", async (req, res) => {
  res.json(await listPlaces(currentUser(req).householdId));
});

placesRouter.post("/floors", canManage, async (req, res) => {
  const input = parse(floorInputSchema, req.body);
  res.status(201).json(await createFloor(currentUser(req).householdId, input));
});

placesRouter.post("/floors/starter", canManage, async (req, res) => {
  const names = parse(starterInputSchema, req.body);
  res.status(201).json(await createStarterFloors(currentUser(req).householdId, names));
});

placesRouter.put("/floors/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(floorInputSchema, req.body);
  res.json(await updateFloor(currentUser(req).householdId, id, input));
});

placesRouter.delete("/floors/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteFloor(currentUser(req).householdId, id);
  res.status(204).end();
});

placesRouter.get("/floors/:id/plan", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getFloorPlan(currentUser(req).householdId, id));
});

placesRouter.put("/floors/:id/plan", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(floorPlanInputSchema, req.body);
  res.json(await saveFloorPlan(currentUser(req).householdId, id, input));
});

placesRouter.post("/", canManage, async (req, res) => {
  const input = parse(placeInputSchema, req.body);
  res.status(201).json(await createPlace(currentUser(req).householdId, input));
});

placesRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getPlaceDetail(currentUser(req).householdId, id));
});

placesRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(placeInputSchema, req.body);
  res.json(await updatePlace(currentUser(req).householdId, id, input));
});

placesRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deletePlace(currentUser(req).householdId, id);
  res.status(204).end();
});
