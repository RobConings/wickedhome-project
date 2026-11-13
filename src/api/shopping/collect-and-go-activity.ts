import type { CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { collectAndGoIssue, upcomingCollectAndGoOrders, type CollectAndGoActivity } from "@/features/shopping/types/collect-and-go-activity";
import { HttpError } from "../lib/http";
import { fetchCollectAndGoCart } from "./collect-and-go-cart-api";
import { fetchCollectAndGoOrder, fetchCollectAndGoOrders } from "./collect-and-go-orders-api";
/** One bounded read snapshot for row labels, online sessions and the retailer tab. No writes. */
export async function fetchCollectAndGoActivity(state: CollectAndGoState, signal: AbortSignal): Promise<CollectAndGoActivity> {
  const pending = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
  const read = async <T>(operation: () => Promise<T>): Promise<PromiseSettledResult<T>> => {
    try { return { status: "fulfilled", value: await operation() }; }
    catch (reason) {
      if (reason instanceof HttpError && ["collectandgo_login", "collectandgo_challenge"].includes(reason.code)) throw reason;
      return { status: "rejected", reason };
    }
  };
  // Avoid request bursts and stop before any further retailer request after a challenge.
  const cart = await read(() => fetchCollectAndGoCart(state, pending));
  const orders = await read(() => fetchCollectAndGoOrders(state, pending));
  const upcoming = orders.status === "fulfilled" ? upcomingCollectAndGoOrders(orders.value.orders, Date.now()) : [];
  const reservations = [];
  let incomplete = upcoming.length > 5 || (orders.status === "fulfilled" && orders.value.truncated);
  // Bound retailer traffic and return only verified reservations. The UI exposes partial coverage.
  for (const order of upcoming.slice(0, 5)) {
    try { reservations.push(await fetchCollectAndGoOrder(state, order.id, pending)); }
    catch (error) { if (error instanceof HttpError && ["collectandgo_login", "collectandgo_challenge"].includes(error.code)) throw error; incomplete = true; }
  }
  pending.throwIfAborted();
  return { ...(cart.status === "fulfilled" ? { cart: cart.value } : { cartError: collectAndGoIssue(cart.reason instanceof HttpError ? cart.reason.code : "") }), ...(orders.status === "fulfilled" ? { orders: orders.value } : { ordersError: collectAndGoIssue(orders.reason instanceof HttpError ? orders.reason.code : "") }), reservations, reservationsIncomplete: incomplete };
}
