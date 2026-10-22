import { Router } from "express";
import {
  applianceInputSchema,
  batteryInputSchema,
  energySettingsInputSchema,
  intervalImportSchema,
  meterReadingInputSchema,
  solarInstallationInputSchema,
  summaryQuerySchema,
} from "@/features/energy/types/energy";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  createAppliance,
  createBattery,
  createReading,
  createSolarInstallation,
  deleteAppliance,
  deleteBattery,
  deleteReading,
  deleteSolarInstallation,
  getEnergyData,
  getEnergySetup,
  getEnergySummary,
  importIntervals,
  listAppliances,
  saveEnergySettings,
  updateAppliance,
  updateBattery,
  updateSolarInstallation,
} from "./energy.service";

export const energyRouter = Router();

energyRouter.use(requireUser);

const canManage = requireRole("owner", "adult");
const household = (req: Parameters<typeof currentUser>[0]) => currentUser(req).householdId;

/**
 * Totals, time series, appliance breakdown and capacity peak for one day, week, month or year, for
 * `carrier=electricity` (default), `gas` or `total`.
 */
energyRouter.get("/summary", async (req, res) => {
  const { period, date, carrier } = parse(summaryQuerySchema, req.query);
  res.json(await getEnergySummary(household(req), period, date, carrier));
});

// Appliances
energyRouter.get("/appliances", async (req, res) => {
  res.json(await listAppliances(household(req)));
});

energyRouter.post("/appliances", canManage, async (req, res) => {
  res.status(201).json(await createAppliance(household(req), parse(applianceInputSchema, req.body)));
});

energyRouter.put("/appliances/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await updateAppliance(household(req), id, parse(applianceInputSchema, req.body)));
});

energyRouter.delete("/appliances/:id", canManage, async (req, res) => {
  await deleteAppliance(household(req), parse(idSchema, req.params.id));
  res.status(204).end();
});

// Solar installations and batteries
energyRouter.get("/setup", async (req, res) => {
  res.json(await getEnergySetup(household(req)));
});

energyRouter.post("/solar", canManage, async (req, res) => {
  res.status(201).json(await createSolarInstallation(household(req), parse(solarInstallationInputSchema, req.body)));
});

energyRouter.put("/solar/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await updateSolarInstallation(household(req), id, parse(solarInstallationInputSchema, req.body)));
});

energyRouter.delete("/solar/:id", canManage, async (req, res) => {
  await deleteSolarInstallation(household(req), parse(idSchema, req.params.id));
  res.status(204).end();
});

energyRouter.post("/batteries", canManage, async (req, res) => {
  res.status(201).json(await createBattery(household(req), parse(batteryInputSchema, req.body)));
});

energyRouter.put("/batteries/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await updateBattery(household(req), id, parse(batteryInputSchema, req.body)));
});

energyRouter.delete("/batteries/:id", canManage, async (req, res) => {
  await deleteBattery(household(req), parse(idSchema, req.params.id));
  res.status(204).end();
});

/** Gas connection settings: EAN and the calorific value for manual m³ readings. */
energyRouter.put("/settings", canManage, async (req, res) => {
  res.json(await saveEnergySettings(household(req), parse(energySettingsInputSchema, req.body)));
});

// Data: meters, Fluvius imports, manual readings
energyRouter.get("/data", async (req, res) => {
  res.json(await getEnergyData(household(req)));
});

energyRouter.post("/intervals/import", canManage, async (req, res) => {
  res.json(await importIntervals(household(req), parse(intervalImportSchema, req.body)));
});

energyRouter.post("/readings", canManage, async (req, res) => {
  await createReading(household(req), parse(meterReadingInputSchema, req.body));
  res.status(201).end();
});

energyRouter.delete("/readings/:id", canManage, async (req, res) => {
  await deleteReading(household(req), parse(idSchema, req.params.id));
  res.status(204).end();
});
