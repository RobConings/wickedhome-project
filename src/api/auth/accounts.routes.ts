import { Router, type Request } from "express";
import {
  acceptInviteInputSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  changeRoleInputSchema,
  createInviteInputSchema,
  linkTokenSchema,
  resetPasswordInputSchema,
} from "@/features/auth/types/accounts";
import { idSchema } from "@/types/common";
import { HttpError, notFound, parse } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { currentSessionId, currentUser, requireRole, requireUser, revokeSessions, startSession } from "../lib/session";
import {
  changeRole,
  createInvite,
  createResetLink,
  getAccountsOverview,
  removeAccount,
  revokeInvite,
  setDisabled,
  signOutEverywhere,
} from "./accounts.service";
import { acceptInvite, lookupLink, resetPassword } from "./links.service";
import { changeEmail, changePassword, getMyAccount } from "./my-account.service";

const WINDOW_MS = 15 * 60 * 1000;
/** Opening link pages, per IP. Generous for a family on one home connection, tight for guessing. */
const lookupLimiter = createRateLimiter({ limit: 30, windowMs: WINDOW_MS });
/** Using a link (creating an account or setting a password), per IP. */
const acceptLimiter = createRateLimiter({ limit: 10, windowMs: WINDOW_MS });
/** Checks of the current password under My account, per user. */
const passwordCheckLimiter = createRateLimiter({ limit: 10, windowMs: WINDOW_MS });

/**
 * The token travels in the request body (POST), never in an API URL, so it doesn't end up in access logs of
 * the API. Malformed tokens get the same 404 as unknown ones.
 */
function readToken(req: Request): string {
  const result = linkTokenSchema.safeParse((req.body as { token?: unknown } | undefined)?.token);
  if (!result.success) throw notFound("This link doesn't work");
  return result.data;
}

function refuseWhenLoggedIn(req: Request) {
  if (req.user) throw new HttpError(409, "logged_in", "Log out first to use this link");
}

// ── Public: /api/auth/links ──────────────────────────────────────────────────

export const linksRouter = Router();

linksRouter.post("/lookup", async (req, res) => {
  lookupLimiter.hit(req.ip ?? "unknown");
  res.json(await lookupLink(readToken(req)));
});

linksRouter.post("/accept-invite", async (req, res) => {
  acceptLimiter.hit(req.ip ?? "unknown");
  readToken(req);
  refuseWhenLoggedIn(req);
  const { userId } = await acceptInvite(parse(acceptInviteInputSchema, req.body));
  await startSession(req, res, userId);
  res.status(201).end();
});

linksRouter.post("/reset-password", async (req, res) => {
  acceptLimiter.hit(req.ip ?? "unknown");
  readToken(req);
  refuseWhenLoggedIn(req);
  const { userId } = await resetPassword(parse(resetPasswordInputSchema, req.body));
  await startSession(req, res, userId);
  res.status(204).end();
});

// ── Owners and adults: /api/auth/accounts ────────────────────────────────────

export const accountsRouter = Router();
accountsRouter.use(requireUser, requireRole("owner", "adult"));

const targetId = (req: Request) => parse(idSchema, req.params.id);

accountsRouter.get("/", async (req, res) => {
  res.json(await getAccountsOverview(currentUser(req).householdId));
});

accountsRouter.post("/invites", async (req, res) => {
  res.status(201).json(await createInvite(currentUser(req), parse(createInviteInputSchema, req.body)));
});

accountsRouter.delete("/invites/:id", async (req, res) => {
  await revokeInvite(currentUser(req), targetId(req));
  res.status(204).end();
});

accountsRouter.put("/:id/role", async (req, res) => {
  await changeRole(currentUser(req), targetId(req), parse(changeRoleInputSchema, req.body).role);
  res.status(204).end();
});

accountsRouter.post("/:id/disable", async (req, res) => {
  await setDisabled(currentUser(req), targetId(req), true);
  res.status(204).end();
});

accountsRouter.post("/:id/enable", async (req, res) => {
  await setDisabled(currentUser(req), targetId(req), false);
  res.status(204).end();
});

accountsRouter.post("/:id/sign-out", async (req, res) => {
  res.json({ signedOut: await signOutEverywhere(currentUser(req), targetId(req)) });
});

accountsRouter.post("/:id/reset-link", async (req, res) => {
  res.status(201).json(await createResetLink(currentUser(req), targetId(req)));
});

accountsRouter.delete("/:id", async (req, res) => {
  await removeAccount(currentUser(req), targetId(req));
  res.status(204).end();
});

// ── Everyone: /api/auth/me/* ─────────────────────────────────────────────────

export const myAccountRouter = Router();
myAccountRouter.use(requireUser);

myAccountRouter.get("/account", async (req, res) => {
  res.json(await getMyAccount(currentUser(req).id, currentSessionId(req)));
});

myAccountRouter.put("/email", async (req, res) => {
  const user = currentUser(req);
  const input = parse(changeEmailInputSchema, req.body);
  passwordCheckLimiter.hit(user.id);
  await changeEmail(user.id, input);
  res.status(204).end();
});

myAccountRouter.put("/password", async (req, res) => {
  const user = currentUser(req);
  const input = parse(changePasswordInputSchema, req.body);
  passwordCheckLimiter.hit(user.id);
  await changePassword(user.id, input, currentSessionId(req));
  res.status(204).end();
});

myAccountRouter.post("/sign-out-others", async (req, res) => {
  const user = currentUser(req);
  res.json({ signedOut: await revokeSessions(user.id, currentSessionId(req)) });
});
