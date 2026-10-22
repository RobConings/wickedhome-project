import { Router } from "express";
import { z } from "zod";
import type { Role } from "@/features/auth/types/auth";
import { updateAutomationInputSchema, type AutomationsOverview } from "@/features/automations/types/automations";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { startJobNow } from "./job-scheduler";
import { getAutomation, listAutomationRuns, listAutomations, setAutomationEnabled } from "./jobs.service";
import "./run-history.jobs";

/**
 * /api/jobs: the scheduled jobs ("Automations" in Settings). Everyone signed in may look; owners and adults
 * may pause, resume and run them. Jobs are app-wide (they work for every household), not per household.
 */

const MANAGERS: Role[] = ["owner", "adult"];
const canManageJobs = (role: Role) => MANAGERS.includes(role);

const jobIdSchema = z.string().min(1).max(100);
const runsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

export const jobsRouter = Router();
jobsRouter.use(requireUser);

jobsRouter.get("/", async (req, res) => {
  const body: AutomationsOverview = { jobs: await listAutomations(), canManage: canManageJobs(currentUser(req).role) };
  res.json(body);
});

jobsRouter.get("/:id", async (req, res) => {
  res.json(await getAutomation(parse(jobIdSchema, req.params.id)));
});

jobsRouter.get("/:id/runs", async (req, res) => {
  const { limit } = parse(runsQuerySchema, req.query);
  res.json(await listAutomationRuns(parse(jobIdSchema, req.params.id), limit));
});

/** Starts a run in the background: 202 with the job (running), the app polls `GET /:id` until it's done. */
jobsRouter.post("/:id/run", requireRole(...MANAGERS), async (req, res) => {
  const id = parse(jobIdSchema, req.params.id);
  startJobNow(id);
  res.status(202).json(await getAutomation(id));
});

jobsRouter.patch("/:id", requireRole(...MANAGERS), async (req, res) => {
  const id = parse(jobIdSchema, req.params.id);
  const { enabled } = parse(updateAutomationInputSchema, req.body);
  res.json(await setAutomationEnabled(id, enabled));
});
