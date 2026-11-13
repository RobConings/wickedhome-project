import { collectAndGoCartApiSchema, type CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { HttpError } from "../lib/http";

export const collectAndGoUnverified = () => new HttpError(409, "collectandgo_unverified", "The Collect&Go response did not prove access to the requested signed-in basket or order. Reconnect with a fresh cart API HAR.");
export const retailerRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export const retailerDecimal = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
export const retailerCents = (value: unknown) => { const price = retailerDecimal(value); return Number.isFinite(price) && price >= 0 && price < 1000000 ? Math.round(price * 100) : null; };

/** Fixed, verified read endpoints only. Never replay a captured HAR request or follow a redirect. */
export async function readCollectAndGoJson(state: CollectAndGoState, resource: string, signal: AbortSignal, pageNumber = 1): Promise<unknown> {
  const parsed = collectAndGoCartApiSchema.safeParse(state.cartApi);
  if (!parsed.success || !/^(?:cart\/@self|order\/(?:@history|\d{1,20}))$/.test(resource) || !Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 5) throw collectAndGoUnverified();
  const api = parsed.data, order = resource.startsWith("order/");
  const url = new URL(`https://apip.collectandgo.be/gateway/ecomfoodb2c.eshop.${order ? "wcsordersvcv2" : "wcscartsvcv2"}/v2/store/${api.storeId}/${resource}`);
  url.search = new URLSearchParams({ langId: api.langId, catalogId: api.catalogId, ...(order && { pageNumber: String(pageNumber), pageSize: "100" }) }).toString();
  const cookies = state.cookies.filter((cookie) => cookie.value && /^(?:WC_AUTHENTICATION_\d+|WC_USERACTIVITY_\d+|WC_SESSION_ESTABLISHED|WC_ACTIVEPOINTER|WC_PERSISTENT|JSESSIONID|COL_RC|COL_SHOP|APP_C_LANGUAGE|reese84)$/.test(cookie.name) && (cookie.domain === "apip.collectandgo.be" || cookie.domain === ".collectandgo.be" || cookie.domain === "collectandgo.be") && (cookie.expires < 0 || cookie.expires * 1000 > Date.now()));
  if (!cookies.some((cookie) => /^WC_AUTHENTICATION_\d+$/.test(cookie.name))) throw collectAndGoUnverified();
  try {
    const response = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { Accept: "application/json", WCAuthToken: api.authToken, "X-CG-APIKey": api.apiKey, Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "), Origin: "https://www.collectandgo.be", Referer: "https://www.collectandgo.be/", ...(state.userAgent && { "User-Agent": state.userAgent }) } });
    if ([401, 403, 456].includes(response.status)) { await response.body?.cancel(); throw new HttpError(409, response.status === 456 ? "collectandgo_challenge" : "collectandgo_login", "Collect&Go rejected the session or requires browser verification. Import a fresh cart API HAR."); }
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, "collectandgo_unavailable", "Collect&Go could not return the requested basket or order."); }
    if (!response.headers.get("content-type")?.includes("application/json")) { await response.body?.cancel(); throw collectAndGoUnverified(); }
    const reader = response.body?.getReader(); if (!reader) throw collectAndGoUnverified();
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2000000) throw collectAndGoUnverified(); chunks.push(next.value); } }
    finally { await reader.cancel().catch(() => undefined); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "collectandgo_unavailable", "Collect&Go could not be read. Check the connection and try again; no basket or order change was requested.");
  }
}
