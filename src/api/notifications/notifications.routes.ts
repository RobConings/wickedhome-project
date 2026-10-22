import { Router } from "express";
import {
  markReadInputSchema,
  notificationsQuerySchema,
  preferencesInputSchema,
  pushSubscriptionInputSchema,
  scopeInputSchema,
} from "@/features/notifications/types/notifications";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { currentUser, requireUser } from "../lib/session";
import {
  getSettings,
  listNotifications,
  markRead,
  removeDevice,
  savePreferences,
  sendTest,
  setScope,
  subscribe,
  unreadCount,
} from "./notifications.service";
import "./notifications.jobs";

/**
 * /api/notifications (docs/NOTIFICATIONS.md): the signed-in person's own notifications, settings and devices.
 * Everyone, children too; nothing here reaches another person's data.
 */
export const notificationsRouter = Router();
notificationsRouter.use(requireUser);

const testLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

notificationsRouter.get("/", async (req, res) => {
  res.json(await listNotifications(currentUser(req), parse(notificationsQuerySchema, req.query)));
});

notificationsRouter.get("/unread-count", async (req, res) => {
  res.json(await unreadCount(currentUser(req)));
});

notificationsRouter.post("/read", async (req, res) => {
  res.json(await markRead(currentUser(req), parse(markReadInputSchema, req.body ?? {})));
});

notificationsRouter.get("/settings", async (req, res) => {
  res.json(await getSettings(currentUser(req)));
});

notificationsRouter.put("/preferences", async (req, res) => {
  res.json(await savePreferences(currentUser(req), parse(preferencesInputSchema, req.body)));
});

notificationsRouter.post("/scope", async (req, res) => {
  res.json(await setScope(currentUser(req), parse(scopeInputSchema, req.body)));
});

notificationsRouter.post("/devices", async (req, res) => {
  res.status(201).json(await subscribe(currentUser(req), parse(pushSubscriptionInputSchema, req.body), req.get("user-agent")));
});

notificationsRouter.delete("/devices/:id", async (req, res) => {
  await removeDevice(currentUser(req), parse(idSchema, req.params.id));
  res.status(204).end();
});

notificationsRouter.post("/test", async (req, res) => {
  const user = currentUser(req);
  testLimiter.hit(user.id);
  res.json(await sendTest(user));
});
