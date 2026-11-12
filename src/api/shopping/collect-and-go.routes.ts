import { Router } from "express";
import { currentUser, requireUser } from "../lib/session";
import { collectAndGoEnabled, disconnectCollectAndGoBrowser, importCollectAndGoSession } from "./collect-and-go-browser";
import { readCollectAndGoSession } from "./collect-and-go-session";
import { collectAndGoStateSchema } from "@/features/shopping/types/collect-and-go";
import { HttpError, parse } from "../lib/http";
import { secretsAvailable } from "../lib/secrets";
import { requireRole } from "../lib/session";
import { createRateLimiter } from "../lib/rate-limit";
const imports = createRateLimiter({ limit: 10, windowMs: 60000 });
export const collectAndGoRouter = Router();
collectAndGoRouter.use(requireUser);
collectAndGoRouter.get("/status", async (req, res) => {
  const session = await readCollectAndGoSession(currentUser(req).id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ enabled: collectAndGoEnabled(), connected: Boolean(session), importedAt: session?.importedAt ?? null });
});
collectAndGoRouter.delete("/session", async (req, res) => {
  await disconnectCollectAndGoBrowser(currentUser(req).id);
  res.status(204).end();
});
collectAndGoRouter.post("/session", requireRole("owner", "adult"), async (req, res) => {
  const user = currentUser(req);
  imports.hit(user.id);
  if (!secretsAvailable()) throw new HttpError(503, "collectandgo_not_configured", "Integration encryption is not configured.");
  const state = parse(collectAndGoStateSchema, req.body);
  if (!state.cookies.some((cookie) => /(^|\.)collectandgo\.be$/.test(cookie.domain))) throw new HttpError(400, "collectandgo_session", "No Collect&Go cookies were found.");
  await importCollectAndGoSession(user.id, state);
  const saved = await readCollectAndGoSession(user.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ enabled: collectAndGoEnabled(), connected: true, importedAt: saved?.importedAt ?? null });
});
