import { Router } from "express";
import {
  wasteLookupInputSchema,
  wasteRangeQuerySchema,
  wasteSetupInputSchema,
  wasteTaskSettingsInputSchema,
} from "@/features/waste/types/waste";
import { registerCalendarSource } from "../calendar/calendar-sources";
import { HttpError, parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  deleteWasteSetup,
  getWasteDays,
  getWasteSettings,
  getWasteSummary,
  loadWasteCalendarItems,
  lookupWasteAddress,
  saveWasteSetup,
  saveWasteTaskSettings,
  syncWaste,
} from "./waste.service";
import "./waste.jobs";
// "Put out tonight: …" notifications (docs/NOTIFICATIONS.md).
import "./waste.notifications";

export const wasteRouter = Router();

wasteRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

// Collection days appear on the household calendar as read-only all-day items ("PMD + Papier & karton").
registerCalendarSource({
  id: "waste",
  kind: "waste",
  labelKey: "waste:calendarSource",
  load: ({ householdId, from, to }) => loadWasteCalendarItems(householdId, from, to),
});

// The daily sync is the `waste.sync` job (waste.jobs.ts), run by the app's scheduler (docs/AUTOMATIONS.md).

/** Manual refreshes: at most one per household every 30 seconds. */
const REFRESH_GAP_MS = 30_000;
const lastRefresh = new Map<string, number>();

wasteRouter.get("/settings", async (req, res) => {
  res.json(await getWasteSettings(currentUser(req).householdId));
});

wasteRouter.get("/summary", async (req, res) => {
  res.json(await getWasteSummary(currentUser(req).householdId));
});

wasteRouter.get("/collections", async (req, res) => {
  const { from, to } = parse(wasteRangeQuerySchema, req.query);
  res.json(await getWasteDays(currentUser(req).householdId, from, to));
});

wasteRouter.post("/lookup", canManage, async (req, res) => {
  res.json(await lookupWasteAddress(parse(wasteLookupInputSchema, req.body)));
});

wasteRouter.put("/setup", canManage, async (req, res) => {
  const householdId = currentUser(req).householdId;
  lastRefresh.set(householdId, Date.now());
  res.json(await saveWasteSetup(householdId, parse(wasteSetupInputSchema, req.body)));
});

// The "put the bins out" task per collection day: on/off, timing, who. Applied to the open tasks at once.
wasteRouter.put("/task-settings", canManage, async (req, res) => {
  res.json(await saveWasteTaskSettings(currentUser(req).householdId, parse(wasteTaskSettingsInputSchema, req.body)));
});

wasteRouter.delete("/setup", canManage, async (req, res) => {
  await deleteWasteSetup(currentUser(req).householdId);
  res.status(204).end();
});

wasteRouter.post("/sync", canManage, async (req, res) => {
  const householdId = currentUser(req).householdId;
  const last = lastRefresh.get(householdId) ?? 0;
  if (Date.now() - last < REFRESH_GAP_MS) throw new HttpError(429, "too_many_requests", "Just refreshed; try again in a moment");
  lastRefresh.set(householdId, Date.now());
  res.json(await syncWaste(householdId));
});
