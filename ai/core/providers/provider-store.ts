import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "@/api/lib/config";
import { decryptSecret, encryptSecret, secretsAvailable } from "@/api/lib/secrets";
import { conflict } from "@/api/lib/http";
import type { ProviderSelection, ProviderStatus } from "@/features/assistant/types/providers";
import { readAssistantSettings } from "../assistant-config";
import { ChatGptAuthError, ISSUER, RESOURCE, tokenRequest, tokenSchema, verifyIdentity, type OAuthTokens } from "./chatgpt-oauth";

export type Registration = { clientId: string; subject: string; email: string | null; tokens: OAuthTokens | null; expiresAt: number; model: string | null };
type Stored = { planNoticeSeen?: boolean; provider: ProviderSelection["provider"]; active: string | null; registrations: Registration[] };
const root = () => resolve(config.STORAGE_DIR, "..", "assistant-private");
const keyOf = (userId: string) => createHash("sha256").update(userId).digest("hex");
const pathOf = (userId: string) => join(root(), `${keyOf(userId)}.enc`);
const defaults = (): Stored => ({ provider: "local", active: null, registrations: [] });
async function read(userId: string): Promise<Stored> {
  try { return JSON.parse(decryptSecret(await readFile(pathOf(userId), "utf8"), `assistant-provider:${userId}`)) as Stored; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaults(); throw conflict("AI credentials cannot be read. Check INTEGRATIONS_KEY and restore its original value."); }
}
async function write(userId: string, record: Stored) {
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const path = pathOf(userId), temporary = `${path}.${randomBytes(8).toString("hex")}`;
  await writeFile(temporary, encryptSecret(JSON.stringify(record), `assistant-provider:${userId}`), { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}
/** Single Node runtime, one serialization boundary for refresh, import, selection and disconnect. */
const locks = new Map<string, Promise<unknown>>();
export async function withProviderLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const prior = locks.get(userId) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(work);
  locks.set(userId, next);
  try { return await next; } finally { if (locks.get(userId) === next) locks.delete(userId); }
}
let hostPromise: Promise<string> | undefined;
export function serverHostId(): Promise<string> {
  return hostPromise ??= (async () => {
    await mkdir(root(), { recursive: true, mode: 0o700 });
    const path = join(root(), "host-id");
    try { await writeFile(path, `urn:uuid:${randomUUID()}`, { mode: 0o600, flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return (await readFile(path, "utf8")).trim();
  })();
}
export const selectedRegistration = async (userId: string, accountId?: string) => {
  const saved = await read(userId);
  return saved.registrations.find((r) => r.clientId === (accountId ?? saved.active)) ?? null;
};
export async function importRegistration(userId: string, clientId: string, rawTokens: unknown, nonce: string, expectedClientId?: string, expectedSubject?: string) {
  const tokens = tokenSchema.parse(rawTokens);
  const identity = await verifyIdentity(tokens.id_token, clientId, nonce);
  if ((expectedClientId && clientId !== expectedClientId) || (expectedSubject && identity.subject !== expectedSubject)) throw conflict("The paired ChatGPT account does not match the selected account");
  return withProviderLock(userId, async () => {
    const stored = await read(userId);
    const prior = stored.registrations.find((r) => r.clientId === clientId);
    if (prior && prior.subject !== identity.subject) throw conflict("ChatGPT account mismatch");
    const registration: Registration = { clientId, ...identity, tokens, expiresAt: Date.now() + tokens.expires_in * 1000, model: prior?.model ?? null };
    stored.registrations = [...stored.registrations.filter((r) => r.clientId !== clientId), registration];
    stored.active = clientId;
    // Connection never changes the chosen billing path. The person selects it explicitly in settings.
    await serverHostId();
    await write(userId, stored);
  });
}
const terminalRefresh = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);
export function accessToken(userId: string, accountId?: string): Promise<string> {
  return withProviderLock(userId, async () => {
    const stored = await read(userId);
    const selected = stored.registrations.find((r) => r.clientId === (accountId ?? stored.active));
    if (!selected?.tokens) throw new ChatGptAuthError("reconnect_required");
    if (!selected.tokens.scope.split(/\s+/).includes("chatgpt.tokens.use.direct")) throw new ChatGptAuthError("plan_permission_required", 403);
    if (selected.expiresAt > Date.now() + 60000) return selected.tokens.access_token;
    try {
      const response = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", client_id: selected.clientId, refresh_token: selected.tokens.refresh_token, resource: RESOURCE }));
      const renewed = tokenSchema.parse({ ...selected.tokens, ...(response as object) });
      // An ID token isn't necessarily returned during refresh; never revalidate an old expired ID token.
      const freshId = (response as { id_token?: string }).id_token;
      if (freshId && (await verifyIdentity(freshId, selected.clientId)).subject !== selected.subject) throw new ChatGptAuthError("invalid_refresh_token");
      selected.tokens = renewed; selected.expiresAt = Date.now() + renewed.expires_in * 1000;
      await write(userId, stored);
      if (!renewed.scope.split(/\s+/).includes("chatgpt.tokens.use.direct")) throw new ChatGptAuthError("plan_permission_required", 403);
      return renewed.access_token;
    } catch (error) {
      if (error instanceof ChatGptAuthError && terminalRefresh.has(error.code)) { selected.tokens = null; await write(userId, stored); }
      throw error;
    }
  });
}
export async function availableModels(userId: string, accountId?: string) {
  const response = await fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${await accessToken(userId, accountId)}` }, redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new ChatGptAuthError(`chatgpt_http_${response.status}`, response.status);
  const body = await response.json() as { models?: { slug: string; display_name: string; visibility: string }[] };
  return (body.models ?? []).filter((m) => m.visibility === "list" && typeof m.slug === "string" && typeof m.display_name === "string").map((m) => ({ slug: m.slug, displayName: m.display_name }));
}
export async function selectProvider(userId: string, input: ProviderSelection) {
  const accountId = input.accountId ?? (await selectedRegistration(userId))?.clientId;
  const catalog = input.provider === "chatgpt_subscription" ? await availableModels(userId, accountId) : [];
  if (input.provider === "chatgpt_subscription" && !catalog.some((m) => m.slug === input.model)) throw conflict("Select a model available to your ChatGPT account");
  await withProviderLock(userId, async () => {
    const stored = await read(userId);
    const selected = stored.registrations.find((r) => r.clientId === accountId);
    if (input.provider === "chatgpt_subscription") {
      if (!selected?.tokens) throw conflict("Connect ChatGPT first");
      selected.model = input.model!; stored.active = selected.clientId;
    }
    stored.provider = input.provider; await write(userId, stored);
  });
}
export async function providerStatus(userId: string, discover = false, accountId?: string): Promise<ProviderStatus> {
  const local = readAssistantSettings();
  let stored = await read(userId);
  let selected = stored.registrations.find((r) => r.clientId === (accountId ?? stored.active));
  let models: ProviderStatus["models"] = [], error: string | null = null;
  if (discover && selected?.tokens) { try { models = await availableModels(userId, selected.clientId); } catch (e) { error = e instanceof ChatGptAuthError ? e.code : "connection_failed"; } }
  if (discover) { stored = await read(userId); selected = stored.registrations.find((r) => r.clientId === (accountId ?? stored.active)); }
  return { needsPlanNotice: stored.provider === "chatgpt_subscription" && !stored.planNoticeSeen, provider: stored.provider, model: stored.provider === "local" ? local.model : selected?.model ?? null, connected: Boolean(selected?.tokens), permission: Boolean(selected?.tokens?.scope.split(/\s+/).includes("chatgpt.tokens.use.direct")), storageReady: secretsAvailable(), accountId: selected?.clientId ?? null, accounts: stored.registrations.map((r) => ({ id: r.clientId, email: r.email, connected: Boolean(r.tokens) })), models, local: { configured: local.problem === null, model: local.model }, usageUrl: "https://chatgpt.com/settings/usage", error };
}
export async function disconnectProvider(userId: string, accountId?: string) {
  return withProviderLock(userId, async () => {
    const stored = await read(userId), selected = stored.registrations.find((r) => r.clientId === (accountId ?? stored.active));
    let remoteRevoked = !selected?.tokens;
    if (selected?.tokens) {
      try {
        const metadata = await fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000), redirect: "error" });
        if (!metadata.ok) throw new Error("discovery_failed");
        const { revocation_endpoint: endpoint } = await metadata.json() as { revocation_endpoint: string };
        if (new URL(endpoint).origin !== ISSUER) throw new Error("invalid_revocation_endpoint");
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(endpoint, { method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: selected.tokens.refresh_token, token_type_hint: "refresh_token", client_id: selected.clientId }), signal: AbortSignal.timeout(10000) });
            if (res.status === 200) { remoteRevoked = true; break; }
            if (res.status < 500) break;
          } catch { /* bounded retries while the refresh token is available */ }
          if (attempt < 2) await new Promise((done) => setTimeout(done, 300 * 2 ** attempt));
        }
      } catch { /* Local disconnect remains available. Report unconfirmed remote revocation. */ }
      selected.tokens = null; selected.expiresAt = 0;
      // Keep the provider selected so the next request asks to reconnect, never silently uses local billing.
      await write(userId, stored);
    }
    return { remoteRevoked };
  });
}

export async function acknowledgePlanNotice(userId: string) {
  await withProviderLock(userId, async () => { const stored = await read(userId); stored.planNoticeSeen = true; await write(userId, stored); });
}
