import { Router } from "express";
import { habitantInputSchema } from "@/features/household/types/household";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { createHabitant, deleteHabitant, getHouseholdOverview, updateHabitant } from "./household.service";
import { householdSettingsInputSchema } from "@/features/household/types/household-settings";
import { getHouseholdSettings, saveHouseholdSettings } from "./household-settings.service";

export const householdRouter = Router();

householdRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

householdRouter.get("/", async (req, res) => {
  res.json(await getHouseholdOverview(currentUser(req).householdId));
});

householdRouter.post("/habitants", canManage, async (req, res) => {
  const input = parse(habitantInputSchema, req.body);
  res.status(201).json(await createHabitant(currentUser(req).householdId, input));
});

householdRouter.put("/habitants/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(habitantInputSchema, req.body);
  res.json(await updateHabitant(currentUser(req).householdId, id, input));
});

householdRouter.delete("/habitants/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteHabitant(currentUser(req).householdId, id);
  res.status(204).end();
});

// Settings: name and home address (geocoded on save). See household-settings.service.ts.
householdRouter.get("/settings", async (req, res) => {
  res.json(await getHouseholdSettings(currentUser(req).householdId));
});

householdRouter.put("/settings", canManage, async (req, res) => {
  const input = parse(householdSettingsInputSchema, req.body);
  res.json(await saveHouseholdSettings(currentUser(req).householdId, input));
});
