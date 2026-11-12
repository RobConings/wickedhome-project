import { Router } from "express";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { adoptCollectAndGoSession, disconnectCollectAndGoBrowser, importCollectAndGoSession, setCollectAndGoAccess } from "./collect-and-go-browser";
import { collectAndGoStatus } from "./collect-and-go-connection";
import { collectAndGoAccessSchema, collectAndGoConnectionInputSchema } from "@/features/shopping/types/collect-and-go";
import { parse } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
const changes = createRateLimiter({ limit: 20, windowMs: 60000 });
export const collectAndGoRouter = Router();
collectAndGoRouter.use(requireUser);
collectAndGoRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
collectAndGoRouter.get("/status", async (req, res) => { res.json(await collectAndGoStatus(currentUser(req))); });
collectAndGoRouter.use(requireRole("owner"));
collectAndGoRouter.post("/session", async (req, res) => {
  const user = currentUser(req); changes.hit(user.id);
  res.json(await importCollectAndGoSession(user, parse(collectAndGoConnectionInputSchema, req.body)));
});
collectAndGoRouter.put("/access", async (req, res) => {
  const user = currentUser(req); changes.hit(user.id);
  res.json(await setCollectAndGoAccess(user, parse(collectAndGoAccessSchema, req.body).userIds));
});
collectAndGoRouter.post("/session/adopt", async (req, res) => {
  const user = currentUser(req); changes.hit(user.id);
  res.json(await adoptCollectAndGoSession(user, parse(collectAndGoAccessSchema, req.body).userIds));
});
collectAndGoRouter.delete("/session", async (req, res) => { const user = currentUser(req); changes.hit(user.id); await disconnectCollectAndGoBrowser(user); res.status(204).end(); });
