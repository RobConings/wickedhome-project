import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import type { Locale } from "@/types/common";
import { config } from "./config";
import { db } from "./db";
import { forbidden, unauthorized } from "./http";

const COOKIE_NAME = "wh_session";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Only touch `lastSeenAt` / extend expiry once per hour, not on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: "strict",
  path: "/",
  maxAge: config.SESSION_DAYS * DAY_MS,
});

function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function startSession(req: Request, res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      userAgent: req.get("user-agent")?.slice(0, 300),
      expiresAt: new Date(Date.now() + config.SESSION_DAYS * DAY_MS),
    },
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, COOKIE_NAME);
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

/** The id (token hash) of the request's session, if it carries a session cookie. */
export function currentSessionId(req: Request): string | undefined {
  const token = readCookie(req, COOKIE_NAME);
  return token ? hashToken(token) : undefined;
}

/** Signs a user out everywhere, or everywhere but `exceptSessionId`. Returns how many sessions ended. */
export async function revokeSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const { count } = await db.session.deleteMany({
    where: { userId, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
  });
  return count;
}

/** Attaches `req.user` when a valid session cookie is present. Never rejects on its own. */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return next();

  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { habitant: true, household: true } } },
  });
  // A disabled account has no sessions left; the check is a second line of defence.
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) return next();

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + config.SESSION_DAYS * DAY_MS) },
    });
  }

  const { user } = session;
  req.user = {
    id: user.id,
    email: user.email,
    name: user.habitant?.name ?? user.email,
    role: user.role.toLowerCase() as Role,
    locale: user.locale as Locale,
    householdId: user.householdId,
    householdName: user.household.name,
    habitantId: user.habitantId,
  };
  next();
};

export const requireUser: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : unauthorized());
};

/** Use after `requireUser`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    next(req.user && roles.includes(req.user.role) ? undefined : forbidden());
  };

/** Narrowing helper for handlers mounted behind `requireUser`. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
