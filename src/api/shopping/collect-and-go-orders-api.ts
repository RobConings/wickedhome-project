import { collectAndGoOrderIdSchema, type CollectAndGoOrder, type CollectAndGoOrderDetail, type CollectAndGoOrders, type CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { collectAndGoUnverified as invalid, retailerRecord as record, retailerDecimal as decimal, retailerCents as cents, readCollectAndGoJson } from "./collect-and-go-api";
import { fetchCollectAndGoCart } from "./collect-and-go-cart-api";

const timeZone = "Europe/Brussels" as const;
const clock = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Retailer wall-clock fields are Belgian time, never server time. Reject invalid/ambiguous DST times. */
export function collectAndGoInstant(date: unknown, time: unknown): string | null {
  if (typeof date !== "string" || !/^20\d{6}$/.test(date) || typeof time !== "string" || !/^\d{4}$/.test(time)) return null;
  const year = date.slice(0, 4), month = date.slice(4, 6), day = date.slice(6, 8), hour = time.slice(0, 2), minute = time.slice(2, 4);
  const wall = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const matches = [1, 2].map((offset) => wall - offset * 3600000).filter((instant) => {
    const parts = Object.fromEntries(clock.formatToParts(instant).map((part) => [part.type, part.value]));
    return parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute;
  });
  return matches.length === 1 ? new Date(matches[0]!).toISOString() : null;
}
function accountId(state: CollectAndGoState) {
  const ids = [...new Set(state.cookies.filter((cookie) => cookie.value && ["apip.collectandgo.be", ".collectandgo.be", "collectandgo.be"].includes(cookie.domain) && (cookie.expires < 0 || cookie.expires * 1000 > Date.now())).flatMap((cookie) => /^WC_AUTHENTICATION_(\d+)$/.exec(cookie.name)?.[1] ?? []))];
  if (ids.length !== 1) throw invalid();
  return ids[0]!;
}
function owned(value: unknown, buyerId: string) {
  const order = record(value);
  if (!order || order.buyerId !== buyerId || !collectAndGoOrderIdSchema.safeParse(order.orderId).success || typeof order.orderStatus !== "string" || !/^[A-Z]{1,3}$/.test(order.orderStatus)) throw invalid();
  return order;
}
export function parseCollectAndGoOrder(value: unknown, buyerId: string, now = Date.now()): CollectAndGoOrder {
  const order = owned(value, buyerId);
  if (order.orderStatus === "P") throw invalid(); // A pending basket is not a submitted reservation.
  const amendableUntil = collectAndGoInstant(order.x_aortDate, order.x_aortTime);
  const providerAmendable = order.x_isAmendable === "true" ? true : order.x_isAmendable === "false" ? false : null;
  const pickupFrom = collectAndGoInstant(order.x_handoverDate, order.x_handoverTimeFrom), pickupUntil = collectAndGoInstant(order.x_handoverDate, order.x_handoverTimeTo);
  // Only the observed M reservation state can be reported open; unknown states never imply permission.
  const editState = providerAmendable === false || order.locked === "true" || order.orderStatus === "C" || (amendableUntil !== null && Date.parse(amendableUntil) <= now) ? "closed" : providerAmendable === true && order.locked === "false" && order.orderStatus === "M" && amendableUntil !== null ? "open" : "unknown";
  return { id: order.orderId as string, url: `https://www.collectandgo.be/nl/bestelling/${order.orderId}`, status: order.orderStatus as string, pickupPoint: typeof order.x_handoverPointTitle === "string" ? order.x_handoverPointTitle.trim().slice(0, 200) || null : null, pickupFrom, pickupUntil: pickupFrom && pickupUntil && pickupUntil > pickupFrom ? pickupUntil : null, amendableUntil, providerAmendable, editState, estimatedTotalCents: order.grandTotalCurrency === "EUR" ? cents(order.grandTotal) : null };
}
function pagination(raw: Record<string, unknown>, rows: unknown[], page: number, expectedTotal?: number) {
  const total = decimal(raw.recordSetTotal), count = decimal(raw.recordSetCount), start = decimal(raw.recordSetStartNumber);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(count) || total < 0 || start !== (page - 1) * 100 || count !== rows.length || count > 100 || start + count > total || (expectedTotal !== undefined && total !== expectedTotal) || (start + count < total && count !== 100)) throw invalid();
  return total;
}
export async function fetchCollectAndGoOrders(state: CollectAndGoState, signal: AbortSignal): Promise<CollectAndGoOrders> {
  const buyerId = accountId(state);
  const values: Record<string, unknown>[] = []; const seen = new Set<string>(); let total: number | undefined;
  for (let page = 1; page <= 5; page++) {
    const raw = record(await readCollectAndGoJson(state, "order/@history", signal, page));
    if (!raw || raw.resourceName !== "order" || !Array.isArray(raw.Order)) throw invalid();
    total = pagination(raw, raw.Order, page, total);
    if (total === 0) await fetchCollectAndGoCart(state, signal); // Prove sign-in for explicitly empty history; non-empty rows prove their buyer themselves.
    for (const value of raw.Order) { const order = owned(value, buyerId); const id = order.orderId as string; if (seen.has(id)) throw invalid(); seen.add(id); if (order.orderStatus !== "P") values.push(order); }
    if (page * 100 >= total) break;
  }
  const now = Date.now();
  return { authenticated: true, observedAt: new Date(now).toISOString(), timeZone, orders: values.map((value) => parseCollectAndGoOrder(value, buyerId, now)), truncated: total! > seen.size };
}
export async function fetchCollectAndGoOrder(state: CollectAndGoState, id: string, signal: AbortSignal): Promise<CollectAndGoOrderDetail> {
  if (!collectAndGoOrderIdSchema.safeParse(id).success) throw invalid();
  const buyerId = accountId(state), items: CollectAndGoOrderDetail["items"] = [], seen = new Set<string>(); let total: number | undefined, summary: CollectAndGoOrder | undefined, signature: string | undefined;
  for (let page = 1; page <= 5; page++) {
    const raw = record(await readCollectAndGoJson(state, `order/${id}`, signal, page));
    if (!raw || raw.resourceName !== "order" || raw.orderId !== id || !Array.isArray(raw.orderItem)) throw invalid();
    const current = parseCollectAndGoOrder(raw, buyerId);
    const currentSignature = JSON.stringify([current, raw.lastUpdateDate]);
    if (signature && signature !== currentSignature) throw invalid();
    signature = currentSignature; summary = current;
    total = pagination(raw, raw.orderItem, page, total);
    for (const value of raw.orderItem) {
      const item = record(value), quantity = decimal(item?.quantity);
      if (!item || typeof item.orderItemId !== "string" || !item.orderItemId || seen.has(item.orderItemId) || typeof item.xitem_productName !== "string" || !item.xitem_productName.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || item.currency !== "EUR") throw invalid();
      seen.add(item.orderItemId);
      items.push({ name: item.xitem_productName.trim().slice(0, 300), url: null, quantity, unitPriceCents: cents(item.unitPrice) });
    }
    if (page * 100 >= total) break;
  }
  const now = Date.now();
  // A cutoff can pass during pagination. Never return a stale 'open' result.
  if (summary!.amendableUntil && Date.parse(summary!.amendableUntil) <= now) summary!.editState = "closed";
  return { ...summary!, authenticated: true, observedAt: new Date(now).toISOString(), timeZone, items, truncated: total! > items.length };
}
