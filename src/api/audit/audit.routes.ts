import { Router } from "express";
import { auditQuerySchema } from "@/features/audit/types/audit";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { listAuditEntries } from "./audit.service";
import "./audit.jobs";

/** /api/audit: the household's activity log (Settings → Activity), for owners and adults. Read-only. */
export const auditRouter = Router();
auditRouter.use(requireUser, requireRole("owner", "adult"));

auditRouter.get("/", async (req, res) => {
  res.json(await listAuditEntries(currentUser(req).householdId, parse(auditQuerySchema, req.query)));
});
