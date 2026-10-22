import { Router } from "express";
import { loginInputSchema, setupInputSchema, updateAccountInputSchema } from "@/features/auth/types/auth";
import { parse } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { currentUser, endSession, requireUser, startSession } from "../lib/session";
import { accountsRouter, linksRouter, myAccountRouter } from "./accounts.routes";
import { authenticate, getSetupStatus, setupHousehold, updateAccount } from "./auth.service";
import "./auth.jobs";

const loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

export const authRouter = Router();

// Invite and password-reset links (public), household accounts (owners, adults), my account (everyone).
// See docs/ACCOUNTS.md.
authRouter.use("/links", linksRouter);
authRouter.use("/accounts", accountsRouter);
authRouter.use("/me", myAccountRouter);

authRouter.get("/setup/status", async (_req, res) => {
  res.json(await getSetupStatus());
});

authRouter.post("/setup", async (req, res) => {
  const input = parse(setupInputSchema, req.body);
  const { userId } = await setupHousehold(input);
  await startSession(req, res, userId);
  res.status(201).end();
});

authRouter.post("/login", async (req, res) => {
  const input = parse(loginInputSchema, req.body);
  const key = `${req.ip}:${input.email}`;
  loginLimiter.hit(key);

  const { userId } = await authenticate(input);
  loginLimiter.reset(key);
  await startSession(req, res, userId);
  res.status(204).end();
});

authRouter.post("/logout", async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

authRouter.get("/me", requireUser, (req, res) => {
  res.json(currentUser(req));
});

authRouter.patch("/me", requireUser, async (req, res) => {
  const input = parse(updateAccountInputSchema, req.body);
  const user = currentUser(req);
  await updateAccount(user.id, input);
  res.json({ ...user, ...input });
});
