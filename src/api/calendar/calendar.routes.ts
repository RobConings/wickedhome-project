import { Router } from "express";
import {
  agendaQuerySchema,
  calendarEventInputSchema,
  storeVisitQuerySchema,
} from "@/features/calendar/types/calendar";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  createEventIn,
  deleteEvent,
  getAgenda,
  getEvent,
  listStoreVisits,
  updateEvent,
} from "./calendar.service";

export const calendarRouter = Router();

calendarRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

/** Household events (occurrences expanded) merged with every registered calendar source. */
calendarRouter.get("/agenda", async (req, res) => {
  const range = parse(agendaQuerySchema, req.query);
  const user = currentUser(req);
  res.json(await getAgenda(user.householdId, range, user.id));
});

calendarRouter.get("/store-visits", async (req, res) => {
  const query = parse(storeVisitQuerySchema, req.query);
  res.json(await listStoreVisits(currentUser(req).householdId, query));
});

calendarRouter.get("/events/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getEvent(currentUser(req).householdId, id));
});

calendarRouter.post("/events", canManage, async (req, res) => {
  const input = parse(calendarEventInputSchema, req.body);
  const user = currentUser(req);
  // `null`: created in another calendar (input.target), not as a household event.
  res.status(201).json(await createEventIn(user.householdId, user.id, input));
});

calendarRouter.put("/events/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(calendarEventInputSchema, req.body);
  res.json(await updateEvent(currentUser(req).householdId, id, input));
});

calendarRouter.delete("/events/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteEvent(currentUser(req).householdId, id);
  res.status(204).end();
});
