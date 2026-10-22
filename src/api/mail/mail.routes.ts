import { Router } from "express";
import { projectMailQuerySchema } from "@/features/integrations/types/mail";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireUser } from "../lib/session";
import { listProjectThreads, unlinkThread } from "./mail.service";
import "./mail.jobs";

/**
 * `/api/mail`: the signed-in person's own mails linked to projects (the project page). Searching, reading,
 * drafting and sending happen through the assistant (ai/skills/mail), always on the person's own Gmail.
 */
export const mailRouter = Router();

mailRouter.use(requireUser);

mailRouter.get("/threads", async (req, res) => {
  const { projectId } = parse(projectMailQuerySchema, req.query);
  res.json(await listProjectThreads(currentUser(req), projectId));
});

mailRouter.delete("/threads/:id", async (req, res) => {
  await unlinkThread(currentUser(req), parse(idSchema, req.params.id));
  res.status(204).end();
});
