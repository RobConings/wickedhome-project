import { isDeepStrictEqual } from "node:util";
import { config } from "../lib/config";
import { HttpError } from "../lib/http";

/** The configured HA origin only. Credentials and raw upstream errors never reach the browser. */
async function request(kind: "script" | "automation", id: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<unknown | null> {
  if (!config.HOME_ASSISTANT_URL || !config.HOME_ASSISTANT_TOKEN) throw new HttpError(503, "ha_unavailable", "Home Assistant is not configured");
  if (!/^[a-z0-9_]+$/.test(id)) throw new Error("Invalid managed configuration id");
  const base = new URL(config.HOME_ASSISTANT_URL);
  const url = new URL(`/api/config/${kind}/config/${id}`, base);
  const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${config.HOME_ASSISTANT_TOKEN}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (method === "GET" && response.status === 404) return null;
  if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, "ha_publish_failed", "Home Assistant could not save this configuration. Check the integration and its logs."); }
  return response.json();
}

export async function configurationMatches(kind: "script" | "automation", id: string, expected: unknown): Promise<boolean> {
  const current = await request(kind, id, "GET");
  return isDeepStrictEqual(current, expected);
}
export async function publishConfiguration(kind: "script" | "automation", id: string, expected: unknown | null, next: unknown) {
  const current = await request(kind, id, "GET");
  if (!isDeepStrictEqual(current, expected)) throw new HttpError(409, "ha_drift", "The managed Home Assistant configuration changed outside WickedHome. Review it before publishing.");
  await request(kind, id, "POST", next);
}
export async function publishingReady(): Promise<boolean> {
  // A missing dispatcher is normal before the first publication; this also checks admin API access.
  try { await request("script", "wickedhome_actions", "GET"); return true; } catch { return false; }
}
