import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";
import { fetchCollectAndGoActivity } from "./collect-and-go-activity";
import type { CollectAndGoState } from "@/features/shopping/types/collect-and-go";
const state: CollectAndGoState = { cookies: [{ name: "WC_AUTHENTICATION_1", value: "synthetic-cookie", domain: "apip.collectandgo.be", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [], cartApi: { storeId: "2", catalogId: "3", langId: "-11", authToken: "synthetic-token", apiKey: "synthetic-key" } };
const order = (id: string) => ({ orderId: id, buyerId: "1", orderStatus: "C", x_isAmendable: "false", locked: "true", x_aortDate: "20200101", x_aortTime: "0900", x_handoverDate: "20990102", x_handoverTimeFrom: "0830", x_handoverTimeTo: "0900", grandTotalCurrency: "EUR", grandTotal: "1.85" });
const cart = () => ({ resourceName: "cart", orderStatus: "P", orderId: "10", x_xtraEmailId: "fixture@example.test", totalProductPriceCurrency: "EUR", recordSetCount: "0", recordSetTotal: "0", recordSetStartNumber: "0" });
afterEach(() => mock.restoreAll());
function retailer(count = 1, brokenCart = false, brokenOrder = "") {
 let detailReads = 0;
 mock.method(globalThis, "fetch", async (input: URL | RequestInfo, options?: RequestInit) => {
  assert.equal(options?.method, "GET"); assert.equal(options.body, undefined);
  const path = new URL(String(input)).pathname;
  if (path.endsWith("cart/@self")) return Response.json(brokenCart ? {} : cart());
  if (path.endsWith("@history")) return Response.json({ resourceName: "order", Order: Array.from({ length: count }, (_, i) => order(String(i + 11))), recordSetCount: String(count), recordSetTotal: String(count), recordSetStartNumber: "0" });
  detailReads++; const id = path.split("/").at(-1)!;
  return Response.json(id === brokenOrder ? {} : { ...order(id), resourceName: "order", recordSetCount: "1", recordSetTotal: "1", recordSetStartNumber: "0", orderItem: [{ orderItemId: `item-${id}`, productId: "123", partNumber: "sku-123", xitem_productName: "BONI frieten Airfryer oven 1kg", quantity: "1", unitPrice: "1.85", currency: "EUR" }] });
 });
 return () => detailReads;
}
it("reads upcoming locked reservations alongside an empty basket without changing any goods", async () => {
 const reads = retailer(); const result = await fetchCollectAndGoActivity(state, new AbortController().signal);
 assert.deepEqual(result.cart?.items, []); assert.equal(result.reservations?.[0]?.items[0]?.name, "BONI frieten Airfryer oven 1kg");
 assert.equal(result.reservations?.[0]?.editState, "closed"); assert.equal(result.reservations?.[0]?.items[0]?.articleNumber, "sku-123"); assert.equal(reads(), 1);
});
it("a basket format failure cannot hide valid reserved products", async () => {
 retailer(1, true); const result = await fetchCollectAndGoActivity(state, new AbortController().signal);
 assert.equal(result.cartError, "unverified"); assert.equal(result.ordersError, undefined); assert.equal(result.reservations?.length, 1);
});
it("bounds reservation preloads, preserves successful reads and marks partial coverage", async () => {
 const reads = retailer(7, false, "12"); const result = await fetchCollectAndGoActivity(state, new AbortController().signal);
 assert.equal(reads(), 5); assert.equal(result.reservationsIncomplete, true); assert.equal(result.reservations?.length, 4);
});
it("returns real login failures for reconnect handling instead of repeated invalid snapshots", async () => {
 mock.method(globalThis, "fetch", async () => new Response("private", { status: 401 }));
 await assert.rejects(fetchCollectAndGoActivity(state, new AbortController().signal), (error: unknown) => error instanceof Error && /rejected the session/.test(error.message) && !error.message.includes("private"));
});
