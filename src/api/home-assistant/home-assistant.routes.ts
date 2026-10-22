import { Router, type Request } from "express";
import {
  alarmArmInputSchema,
  alarmDisarmInputSchema,
  haApplianceLinksInputSchema,
  haImportInputSchema,
  haSettingsInputSchema,
} from "@/features/home-assistant/types/home-assistant";
import { startJobNow } from "../jobs/job-scheduler";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import type { AlarmActor } from "./alarm-guard";
import { HaNotConnectedError } from "./ha-client";
import { armAlarm, disarmAlarm, getAlarmOverview } from "./ha-alarm";
import { connectionStatusFor, isHaHousehold, testConnection } from "./ha-connection";
import { getEnergyOverview, saveApplianceLinks } from "./ha-energy";
import { importDevices, listEntities, listSuggestions, mapHaError, saveSettings } from "./home-assistant.service";
import { HA_ENERGY_JOB_ID } from "./home-assistant.jobs";

export const homeAssistantRouter = Router();

homeAssistantRouter.use(requireUser);

/** Owners and adults set things up and use the alarm; children see the status and the alarm state. */
const canManage = requireRole("owner", "adult");
const household = (req: Request) => currentUser(req).householdId;

/** The signed-in person as an alarm actor (always `kind: "user"`: these routes are the UI). */
function uiActor(req: Request): AlarmActor {
  const user = currentUser(req);
  return { kind: "user", userId: user.id, name: user.name, role: user.role };
}

homeAssistantRouter.get("/status", async (req, res) => {
  res.json(await connectionStatusFor(household(req)));
});

/** "Test connection": ping when connected, else reconnect now and report the outcome (≤ 10 s). */
homeAssistantRouter.post("/test", canManage, async (req, res) => {
  if (!(await isHaHousehold(household(req)))) {
    res.json({ ok: false, haVersion: null, entityCount: 0, latencyMs: null, errorCode: null, errorMessage: null });
    return;
  }
  res.json(await testConnection());
});

// Entities and device import ---------------------------------------------------------------------------------

homeAssistantRouter.get("/entities", canManage, async (req, res) => {
  res.json(await listEntities(household(req)));
});

homeAssistantRouter.get("/suggestions", canManage, async (req, res) => {
  res.json(await listSuggestions(household(req)));
});

homeAssistantRouter.post("/import", canManage, async (req, res) => {
  const input = parse(haImportInputSchema, req.body);
  const user = currentUser(req);
  try {
    res.status(201).json(await importDevices(user.householdId, user.locale, input));
  } catch (error) {
    throw mapHaError(error);
  }
});

homeAssistantRouter.put("/settings", canManage, async (req, res) => {
  await saveSettings(household(req), parse(haSettingsInputSchema, req.body));
  res.status(204).end();
});

// Alarm --------------------------------------------------------------------------------------------------------

homeAssistantRouter.get("/alarm", async (req, res) => {
  const user = currentUser(req);
  res.json(await getAlarmOverview(user.householdId, { includeLog: user.role !== "child" }));
});

/** Arming: `{ mode, confirm: true, code? }`; `confirm` comes from the confirmation dialog. */
homeAssistantRouter.post("/alarm/arm", async (req, res) => {
  const { mode, code } = parse(alarmArmInputSchema, req.body);
  res.json(await armAlarm(household(req), uiActor(req), mode, code));
});

/**
 * Disarming: UI only, with the code (never stored or logged), owners and adults, rate-limited and
 * audit-logged. The role check happens in disarmAlarm so a refused attempt is logged too.
 * Not available to the assistant, MCP or voice: there is no other route or tool that disarms.
 */
homeAssistantRouter.post("/alarm/disarm", async (req, res) => {
  const { code } = parse(alarmDisarmInputSchema, req.body);
  res.json(await disarmAlarm(household(req), uiActor(req), code));
});

// Energy ------------------------------------------------------------------------------------------------------

homeAssistantRouter.get("/energy", async (req, res) => {
  res.json(await getEnergyOverview(household(req)));
});

homeAssistantRouter.put("/energy/links", canManage, async (req, res) => {
  await saveApplianceLinks(household(req), parse(haApplianceLinksInputSchema, req.body));
  try {
    startJobNow(HA_ENERGY_JOB_ID);
  } catch {
    // Already running: the next hourly run picks the new links up.
  }
  res.status(204).end();
});

/** "Import now": starts the energy job in the background (202). */
homeAssistantRouter.post("/energy/import", canManage, async (req, res) => {
  if (!(await isHaHousehold(household(req)))) throw mapHaError(new HaNotConnectedError());
  startJobNow(HA_ENERGY_JOB_ID);
  res.status(202).end();
});
