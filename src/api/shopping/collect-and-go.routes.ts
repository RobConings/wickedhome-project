import { Router } from "express";
import { currentUser, requireUser } from "../lib/session";
import { collectAndGoEnabled, disconnectCollectAndGoBrowser } from "./collect-and-go-browser";
import { readCollectAndGoSession } from "./collect-and-go-session";
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
