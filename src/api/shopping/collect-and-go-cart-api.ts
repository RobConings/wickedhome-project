import { collectAndGoCartApiSchema, type CollectAndGoCart, type CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { HttpError } from "../lib/http";

const invalid = () => new HttpError(409, "collectandgo_unverified", "The Collect&Go response did not prove access to the signed-in online basket. Reconnect with a fresh cart API HAR.");
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const decimal = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;

/** Sanitized contract based on the actual wcscartsvcv2 response, never a guest or placed order. */
export function parseCollectAndGoCartResponse(raw: unknown): CollectAndGoCart {
  const cart = record(raw);
  if (!cart || cart.resourceName !== "cart" || cart.orderStatus !== "P" || typeof cart.orderId !== "string" || !cart.orderId || typeof cart.x_xtraEmailId !== "string" || !/^[^\s@]+@[^\s@]+$/.test(cart.x_xtraEmailId) || cart.totalProductPriceCurrency !== "EUR" || !Array.isArray(cart.orderItem)) throw invalid();
  const total = decimal(cart.recordSetTotal), count = decimal(cart.recordSetCount), start = decimal(cart.recordSetStartNumber);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(count) || start !== 0 || total < cart.orderItem.length || count !== cart.orderItem.length) throw invalid();
  const items = cart.orderItem.slice(0, 500).map((value) => {
    const item = record(value), quantity = decimal(item?.quantity);
    if (!item || item.currency !== "EUR" || typeof item.xitem_productName !== "string" || !item.xitem_productName.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw invalid();
    const price = decimal(item.unitPrice);
    return { name: item.xitem_productName.trim().slice(0, 300), url: null, quantity, unitPriceCents: Number.isFinite(price) && price >= 0 && price < 1000000 ? Math.round(price * 100) : null };
  });
  return { authenticated: true, observedAt: new Date().toISOString(), items, truncated: total > items.length };
}

/** The only request here is the documented cart GET; the HAR's captured POST is never replayed. */
export async function fetchCollectAndGoCart(state: CollectAndGoState, signal: AbortSignal): Promise<CollectAndGoCart> {
  const parsed = collectAndGoCartApiSchema.safeParse(state.cartApi);
  if (!parsed.success) throw invalid();
  const api = parsed.data;
  const url = new URL(`https://apip.collectandgo.be/gateway/ecomfoodb2c.eshop.wcscartsvcv2/v2/store/${api.storeId}/cart/@self`);
  url.search = new URLSearchParams({ langId: api.langId, catalogId: api.catalogId }).toString();
  const cookies = state.cookies.filter((cookie) => cookie.value && /^(?:WC_AUTHENTICATION_\d+|WC_USERACTIVITY_\d+|WC_SESSION_ESTABLISHED|WC_ACTIVEPOINTER|WC_PERSISTENT|JSESSIONID|COL_RC|COL_SHOP|APP_C_LANGUAGE|reese84)$/.test(cookie.name) && (cookie.domain === "apip.collectandgo.be" || cookie.domain === ".collectandgo.be" || cookie.domain === "collectandgo.be") && (cookie.expires < 0 || cookie.expires * 1000 > Date.now()));
  if (!cookies.some((cookie) => /^WC_AUTHENTICATION_\d+$/.test(cookie.name))) throw invalid();
  try {
    const response = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { Accept: "application/json", WCAuthToken: api.authToken, "X-CG-APIKey": api.apiKey, Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "), Origin: "https://www.collectandgo.be", Referer: "https://www.collectandgo.be/", ...(state.userAgent && { "User-Agent": state.userAgent }) } });
    if ([401, 403, 456].includes(response.status)) { await response.body?.cancel(); throw new HttpError(409, response.status === 456 ? "collectandgo_challenge" : "collectandgo_login", "Collect&Go rejected the session or requires browser verification. Import a fresh cart API HAR."); }
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, "collectandgo_unavailable", "Collect&Go could not return its online basket."); }
    if (!response.headers.get("content-type")?.includes("application/json")) { await response.body?.cancel(); throw invalid(); }
    const reader = response.body?.getReader(); if (!reader) throw invalid();
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2000000) throw invalid(); chunks.push(next.value); } }
    finally { await reader.cancel().catch(() => undefined); }
    return parseCollectAndGoCartResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "collectandgo_unavailable", "Collect&Go could not be read. Check the connection and try again; no basket change was requested.");
  }
}
