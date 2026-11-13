import type { CollectAndGoCart, CollectAndGoOrder, CollectAndGoOrderDetail, CollectAndGoOrders } from "./collect-and-go";
export type CollectAndGoReadError = "unavailable" | "blocked" | "reconnect" | "unverified" | "credentials";
export type CollectAndGoActivity = { cart?: CollectAndGoCart; cartError?: CollectAndGoReadError; orders?: CollectAndGoOrders; ordersError?: CollectAndGoReadError; reservations?: CollectAndGoOrderDetail[]; reservationsIncomplete?: boolean };
export const collectAndGoIssue = (code: string): CollectAndGoReadError => code === "collectandgo_credentials_missing" ? "credentials" : code === "collectandgo_challenge" ? "blocked" : code === "collectandgo_login" ? "reconnect" : code === "collectandgo_unverified" ? "unverified" : "unavailable";
/** Observed M editable / C confirmed reservations remain upcoming until pickup, regardless of amendment cutoff. */
export function upcomingCollectAndGoOrders(orders: readonly CollectAndGoOrder[], now: number): CollectAndGoOrder[] {
  return orders.filter(order => ["M", "C"].includes(order.status) && order.pickupUntil && Date.parse(order.pickupUntil) > now).sort((a, b) => (a.pickupFrom ?? "").localeCompare(b.pickupFrom ?? ""));
}
