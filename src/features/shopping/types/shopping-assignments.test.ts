import assert from "node:assert/strict";
import { it } from "node:test";
import { shoppingAssignments } from "./shopping-assignments";
import type { ShoppingItem } from "./shopping";
import type { ShoppingSessionCoverage } from "./sessions";
import type { CollectAndGoInitial } from "../data/use-collect-and-go";
const now = Date.parse("2026-11-13T08:12:21Z"), observedAt = new Date(now).toISOString();
const item = { id: "need-fries", productId: "fries", status: "open", name: "BONI frieten Airfryer oven 1kg", requirements: [{ id: "another-need" }] } as ShoppingItem;
const order = { id: "11", url: "https://www.collectandgo.be/nl/bestelling/11", status: "C", pickupPoint: "Example", pickupFrom: "2026-11-14T07:30:00Z", pickupUntil: "2026-11-14T08:00:00Z", amendableUntil: "2026-11-13T08:00:00Z", providerAmendable: false, editState: "closed" as const, estimatedTotalCents: 185 };
const online = (): CollectAndGoInitial => ({ status: { connected: true, enabled: false, cartEnabled: true, canUse: true, canManage: false, configured: true, needsReconnect: false, legacyAvailable: false, importedAt: observedAt, members: [] }, cart: { authenticated: true, observedAt, truncated: false, items: [] }, orders: { authenticated: true, observedAt, timeZone: "Europe/Brussels", orders: [{ ...order }], truncated: false }, reservations: [{ ...order, authenticated: true, observedAt, timeZone: "Europe/Brussels", items: [{ name: item.name, quantity: 1, unitPriceCents: 185, url: null }], truncated: false }] });
const coverage = (): ShoppingSessionCoverage => ({ observedAt, truncated: false, sessions: [{ id: "trip", name: "Colruyt ronde", status: "active", startedAt: observedAt, items: [{ productId: "fries", requirementIds: ["need-fries"], quantity: 2, purchasedQuantity: 1, unit: "zak" }] }] });
it("marks fries reserved after amendments close, even with an empty pending basket", () => {
 const result = shoppingAssignments([item], [], null, online(), now).get(item.id)!;
 assert.equal(result.length, 1); assert.equal(result[0]?.kind, "reservation"); assert.match(result[0]!.href, /sessions\?retailer=collectandgo&order=11/);
 assert.equal(item.status, "open");
});
it("keeps basket, reservations and other shopping sessions distinct and links each", () => {
 const data = online(); data.cart!.items = [{ name: item.name, quantity: 1, unitPriceCents: 185, url: null }];
 const result = shoppingAssignments([item], [], coverage(), data, now).get(item.id)!;
 assert.deepEqual(result.map(value => value.kind), ["session", "basket", "reservation"]);
 assert.equal(result[0]?.href, "/shopping/sessions/trip");
});
it("matches session requirement members or exact product identity, not unrelated variants", () => {
 const data = coverage(); data.sessions[0]!.items[0]!.productId = "substituted-product";
 assert.equal(shoppingAssignments([item], [], data, null, now).get(item.id)?.length, 1);
 data.sessions[0]!.items[0]!.requirementIds = ["another-need"];
 assert.equal(shoppingAssignments([item], [], data, null, now).get(item.id)?.length, 1);
 data.sessions[0]!.items[0]!.requirementIds = [];
 assert.equal(shoppingAssignments([item], [], data, null, now).size, 0);
});
it("excludes past pickups, cancelled orders, revoked access and stale or failed reads", () => {
 for (const change of [(data: CollectAndGoInitial) => { data.status.canUse = false; }, (data: CollectAndGoInitial) => { data.ordersError = "unavailable"; }, (data: CollectAndGoInitial) => { data.orders!.observedAt = new Date(now - 90001).toISOString(); }, (data: CollectAndGoInitial) => { data.reservations![0]!.observedAt = new Date(now - 90001).toISOString(); }, (data: CollectAndGoInitial) => { data.orders!.orders[0]!.status = "X"; }, (data: CollectAndGoInitial) => { data.orders!.orders[0]!.pickupUntil = observedAt; }]) { const data = online(); change(data); assert.equal(shoppingAssignments([item], [], null, data, now).size, 0); }
});
it("removes visit labels when no quantity remains or a visit is closed, removed or stale", () => {
 const data = coverage(); data.sessions[0]!.items[0]!.purchasedQuantity = 2;
 assert.equal(shoppingAssignments([item], [], data, null, now).size, 0);
 assert.equal(shoppingAssignments([item], [], { ...coverage(), sessions: [] }, null, now).size, 0);
 assert.equal(shoppingAssignments([item], [], coverage(), null, now + 90001).size, 0);
 assert.equal(shoppingAssignments([{ ...item, status: "bought" }], [], coverage(), online(), now).size, 0);
});
