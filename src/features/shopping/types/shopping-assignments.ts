import type { Product, ShoppingItem } from "./shopping";
import type { ShoppingSessionCoverage } from "./sessions";
import { sessionDisplayName } from "./sessions";
import type { CollectAndGoActivity } from "./collect-and-go-activity";
import { upcomingCollectAndGoOrders } from "./collect-and-go-activity";
import type { CollectAndGoStatus } from "./collect-and-go";
import { collectAndGoMatches } from "./collect-and-go-matches";
export type ShoppingAssignment = { kind: "basket" | "reservation" | "session"; id: string; href: string; name: string; pickupFrom?: string | null; quantity?: number; unit?: string | null };
export type ShoppingAssignments = ReadonlyMap<string, readonly ShoppingAssignment[]>;
const fresh = (observedAt: string, now: number) => Number.isFinite(Date.parse(observedAt)) && now - Date.parse(observedAt) <= 90000 && Date.parse(observedAt) <= now + 5000;
export function shoppingAssignments(items: ShoppingItem[], products: Product[], coverage: ShoppingSessionCoverage | null | undefined, online: (CollectAndGoActivity & { status: CollectAndGoStatus }) | null | undefined, now: number): ShoppingAssignments {
  const result = new Map<string, ShoppingAssignment[]>();
  const add = (id: string, assignment: ShoppingAssignment) => result.set(id, [...(result.get(id) ?? []), assignment]);
  if (coverage && fresh(coverage.observedAt, now)) for (const item of items.filter(item => item.status === "open")) {
    const requirements = new Set([item.id, ...(item.requirements?.map(part => part.id) ?? [])]);
    for (const session of coverage.sessions) {
      if (session.status !== "active") continue;
      const rows = session.items.filter(row => row.quantity > row.purchasedQuantity && (row.requirementIds.some(id => requirements.has(id)) || (item.productId && row.productId === item.productId)));
      if (rows.length) add(item.id, { kind: "session", id: session.id, href: `/shopping/sessions/${encodeURIComponent(session.id)}`, name: sessionDisplayName(session.name, session.startedAt) });
    }
  }
  const usable = Boolean(online?.status.connected && online.status.canUse && !online.status.needsReconnect);
  for (const id of collectAndGoMatches(items, products, online?.cart, usable && !online?.cartError, now)) add(id, { kind: "basket", id: "collectandgo-basket", name: "Collect&Go", href: "/shopping?retailer=collectandgo" });
  if (usable && online?.orders && !online.ordersError && fresh(online.orders.observedAt, now)) {
    const active = new Map(upcomingCollectAndGoOrders(online.orders.orders, now).map(order => [order.id, order]));
    for (const reservation of online.reservations ?? []) {
      const order = active.get(reservation.id);
      if (!order || !["M", "C"].includes(reservation.status) || !reservation.pickupUntil || Date.parse(reservation.pickupUntil) <= now) continue;
      for (const id of collectAndGoMatches(items, products, reservation, true, now)) add(id, { kind: "reservation", id: order.id, href: `/shopping/sessions?retailer=collectandgo&order=${encodeURIComponent(order.id)}`, name: "Collect&Go", pickupFrom: order.pickupFrom });
    }
  }
  return result;
}
