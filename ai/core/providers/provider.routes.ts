import { stopUserRuns } from "../assistant-runs";
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "@/api/lib/config";
import { db } from "@/api/lib/db";
import { conflict, HttpError, parse } from "@/api/lib/http";
import { createRateLimiter } from "@/api/lib/rate-limit";
import { currentUser, requireUser } from "@/api/lib/session";
import { secretsAvailable } from "@/api/lib/secrets";
import { providerSelectionSchema } from "@/features/assistant/types/providers";
import { ChatGptAuthError, tokenSchema } from "./chatgpt-oauth";
import { acknowledgePlanNotice, disconnectProvider, importRegistration, providerStatus, selectedRegistration, selectProvider, serverHostId } from "./provider-store";

const pairingInput = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const completionInput = pairingInput.extend({ clientId: z.string().min(1).max(200).refine((v) => v !== "dynamic_agent_client"), tokens: tokenSchema });
type Pending = { userId: string; nonce: string; expires: number; claimed: boolean; clientId?: string; subject?: string; email?: string | null };
const pending = new Map<string, Pending>();
const digest = (code: string) => createHash("sha256").update(code).digest("hex");
const attempts = createRateLimiter({ limit: 20, windowMs: 600000 });
function findPair(code: string) {
  const item = pending.get(digest(code));
  if (!item || item.expires < Date.now()) throw new HttpError(410, "pairing_expired", "The pairing code expired. Start again in AI settings.");
  return item;
}
/** Mounted before requireUser: a high-entropy, short-lived pairing secret is the CLI's only credential. */
export const providerRouter = Router();
providerRouter.post("/provider/pairing/bootstrap", (req, res) => {
  attempts.hit(req.ip ?? "unknown");
  const { code } = parse(pairingInput, req.body), item = findPair(code);
  if (item.claimed) throw conflict("This pairing is already being completed");
  item.nonce = randomBytes(32).toString("base64url");
  res.setHeader("Cache-Control", "no-store");
  res.json({ nonce: item.nonce, ...(item.clientId && { registration: { clientId: item.clientId, email: item.email } }) });
});
providerRouter.post("/provider/pairing/complete", async (req, res) => {
  attempts.hit(req.ip ?? "unknown");
  const input = parse(completionInput, req.body), item = findPair(input.code);
  if (item.claimed) throw conflict("This pairing is already being completed");
  item.claimed = true;
  try {
    const user = await db.user.findUnique({ where: { id: item.userId }, select: { disabledAt: true } });
    if (!user || user.disabledAt) throw new HttpError(403, "account_unavailable", "WickedHome account unavailable");
    await importRegistration(item.userId, input.clientId, input.tokens, item.nonce, item.clientId, item.subject);
    pending.delete(digest(input.code));
    res.status(204).end();
  } catch {
    pending.delete(digest(input.code));
    throw new HttpError(400, "pairing_failed", "Pairing could not be verified. Start again; no new account was activated.");
  }
});
providerRouter.use(requireUser);
providerRouter.get("/provider", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await providerStatus(currentUser(req).id, true, typeof req.query.accountId === "string" ? req.query.accountId : undefined));
});
providerRouter.post("/provider/notice", async (req, res) => {
  await acknowledgePlanNotice(currentUser(req).id);
  res.status(204).end();
});
providerRouter.post("/provider", async (req, res) => {
  try { await selectProvider(currentUser(req).id, parse(providerSelectionSchema, req.body)); }
  catch (error) { if (error instanceof ChatGptAuthError) throw new HttpError(error.status, error.code, "Check your ChatGPT connection and plan permission"); throw error; }
  res.json(await providerStatus(currentUser(req).id, true));
});
providerRouter.post("/provider/pairing", async (req, res) => {
  const user = currentUser(req);
  attempts.hit(user.id);
  if (!secretsAvailable()) throw conflict("Configure INTEGRATIONS_KEY before connecting ChatGPT");
  const server = new URL(config.PUBLIC_URL);
  if (server.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(server.hostname)) throw conflict("Use HTTPS for remote credential transfer");
  const existing = parse(z.object({ newAccount: z.boolean().default(false), accountId: z.string().min(1).max(200).optional() }), req.body ?? {});
  for (const [key, value] of pending) if (value.expires < Date.now() || value.userId === user.id) pending.delete(key);
  if (pending.size >= 100) throw conflict("Too many pending pairings");
  const selected = existing.newAccount ? null : await selectedRegistration(user.id, existing.accountId);
  if (existing.accountId && !existing.newAccount && !selected) throw conflict("Select a saved ChatGPT account");
  const code = randomBytes(32).toString("base64url"), expires = Date.now() + 600000;
  pending.set(digest(code), { userId: user.id, nonce: randomBytes(32).toString("base64url"), expires, claimed: false, ...(selected && { clientId: selected.clientId, subject: selected.subject, email: selected.email }) });
  await serverHostId();
  res.setHeader("Cache-Control", "no-store");
  res.json({ code, expiresAt: new Date(expires).toISOString(), server: server.origin });
});
providerRouter.delete("/provider/pairing", (req, res) => {
  for (const [key, value] of pending) if (value.userId === currentUser(req).id) pending.delete(key);
  res.status(204).end();
});
providerRouter.delete("/provider", async (req, res) => {
  stopUserRuns(currentUser(req).id);
  res.json(await disconnectProvider(currentUser(req).id, typeof req.query.accountId === "string" ? req.query.accountId : undefined));
});
