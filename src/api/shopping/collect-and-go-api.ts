import { collectAndGoCartApiSchema, type CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { HttpError } from "../lib/http";
import { collectAndGoRequestCookies, renewCollectAndGoCookies } from "./collect-and-go-cookies";

export const collectAndGoUnverified = () => new HttpError(409, "collectandgo_unverified", "The Collect&Go response could not be verified. This does not establish that the saved session expired. Try again; if the problem persists, the integration needs checking.");
export const retailerRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export const retailerDecimal = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
export const retailerCents = (value: unknown) => { const price = retailerDecimal(value); return Number.isFinite(price) && price >= 0 && price < 1000000 ? Math.round(price * 100) : null; };

const challenge = () => new HttpError(409, "collectandgo_challenge", "Collect&Go returned an AntiBot challenge requiring browser verification. Automatic reads have stopped. A new HAR does not guarantee server access; an owner can check the normal website and explicitly test the saved connection in Settings.");
async function isChallengePage(response: Response): Promise<boolean> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) return false;
  const reader = response.body?.getReader(); if (!reader) return false;
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (size < 65536) { const next = await reader.read(); if (next.done) break; const chunk = next.value.subarray(0, 65536 - size); chunks.push(chunk); size += chunk.length; } }
  finally { await reader.cancel().catch(() => undefined); }
  const html = Buffer.concat(chunks).toString("utf8");
  return /<title[^>]*>[^<]*(?:anti.?bot|captcha)[^<]*<\/title>/i.test(html) || /vermoeden dat je een bot|suspected.{0,40}bot|incapsula incident/i.test(html);
}

/** Fixed, verified read endpoints only. Never replay a captured HAR request or follow a redirect. */
export async function readCollectAndGoResponse(state: CollectAndGoState, resource: string, signal: AbortSignal, pageNumber = 1): Promise<{ body: unknown; acceptSessionCookies: () => void }> {
  const parsed = collectAndGoCartApiSchema.safeParse(state.cartApi);
  if (!parsed.success) throw new HttpError(409, "collectandgo_credentials_missing", "This older import does not contain cart API credentials. An owner needs to import a cart API HAR once; the saved session is then reused.");
  if (!/^(?:cart\/@self|order\/(?:@history|\d{1,20}))$/.test(resource) || !Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 5) throw collectAndGoUnverified();
  const api = parsed.data, order = resource.startsWith("order/");
  const url = new URL(`https://apip.collectandgo.be/gateway/ecomfoodb2c.eshop.${order ? "wcsordersvcv2" : "wcscartsvcv2"}/v2/store/${api.storeId}/${resource}`);
  url.search = new URLSearchParams({ langId: api.langId, catalogId: api.catalogId, ...(order && { pageNumber: String(pageNumber), pageSize: "100" }) }).toString();
  const cookies = collectAndGoRequestCookies(state, url);
  if (!cookies.some((cookie) => /^WC_AUTHENTICATION_\d+$/.test(cookie.name))) throw new HttpError(409, "collectandgo_login", "The saved Collect&Go session has no usable authentication cookie. Ask an owner to renew it in Settings.");
  if (new Set(cookies.filter(cookie => /^WC_AUTHENTICATION_\d+$/.test(cookie.name)).map(cookie => cookie.name)).size !== 1) throw collectAndGoUnverified();
  try {
    const response = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { Accept: "application/json", WCAuthToken: api.authToken, "X-CG-APIKey": api.apiKey, Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "), Origin: "https://www.collectandgo.be", Referer: "https://www.collectandgo.be/", ...(state.userAgent && { "User-Agent": state.userAgent }) } });
    if (await isChallengePage(response) || response.status === 456) { await response.body?.cancel().catch(() => undefined); throw challenge(); }
    if ([401, 403].includes(response.status)) { await response.body?.cancel().catch(() => undefined); throw new HttpError(409, "collectandgo_login", "Collect&Go rejected the session used for saved sign-in. Ask an owner to renew it in Settings."); }
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new HttpError(502, "collectandgo_unavailable", "Collect&Go could not return the requested basket or order."); }
    if (!response.headers.get("content-type")?.includes("application/json")) { await response.body?.cancel().catch(() => undefined); throw collectAndGoUnverified(); }
    const reader = response.body?.getReader(); if (!reader) throw collectAndGoUnverified();
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2000000) throw collectAndGoUnverified(); chunks.push(next.value); } }
    finally { await reader.cancel().catch(() => undefined); }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return { body, acceptSessionCookies: () => { signal.throwIfAborted(); renewCollectAndGoCookies(state, url, response.headers); } };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "collectandgo_unavailable", "Collect&Go could not be read. Check the connection and try again; no basket or order change was requested.");
  }
}
