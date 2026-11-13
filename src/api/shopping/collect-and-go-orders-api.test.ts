import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";
import type { CollectAndGoState } from "@/features/shopping/types/collect-and-go";
import { collectAndGoInstant, fetchCollectAndGoOrder, fetchCollectAndGoOrders, parseCollectAndGoOrder } from "./collect-and-go-orders-api";
const state: CollectAndGoState = { cookies: [{ name: "WC_AUTHENTICATION_1", value: "synthetic-cookie", domain: "apip.collectandgo.be", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [], cartApi: { storeId: "2", catalogId: "3", langId: "-11", authToken: "synthetic-token", apiKey: "synthetic-key" } };
const summary = () => ({ orderId: "11", buyerId: "1", orderStatus: "M", x_isAmendable: "true", locked: "false", x_aortDate: "20261113", x_aortTime: "0900", x_handoverDate: "20261114", x_handoverTimeFrom: "0830", x_handoverTimeTo: "0900", x_handoverPointTitle: "Example pickup", grandTotalCurrency: "EUR", grandTotal: "12.50", x_phoneNumber: "private-phone", x_xtraEmailId: "private@example.test" });
const item = (id = "21") => ({ orderItemId: id, xitem_productName: "Example bread", quantity: "2.0", unitPrice: "0.48000", currency: "EUR", email1: "private@example.test", addressLine: ["private address"] });
const detail = () => ({ ...summary(), resourceName: "order", recordSetCount: "1", recordSetTotal: "1", recordSetStartNumber: "0", orderItem: [item()] });
const cart = () => ({ resourceName: "cart", orderStatus: "P", orderId: "10", x_xtraEmailId: "fixture@example.test", totalProductPriceCurrency: "EUR", recordSetCount: "0", recordSetTotal: "0", recordSetStartNumber: "0", orderItem: [] });
const history = (orders: unknown[]) => ({ resourceName: "order", recordSetCount: String(orders.length), recordSetTotal: String(orders.length), recordSetStartNumber: "0", Order: orders });
const signal = () => new AbortController().signal;
afterEach(() => mock.restoreAll());
it("uses Belgian wall time across winter/summer, rejects invalid and ambiguous DST cutoffs", () => {
  assert.equal(collectAndGoInstant("20261113", "0900"), "2026-11-13T08:00:00.000Z");
  assert.equal(collectAndGoInstant("20260713", "0900"), "2026-07-13T07:00:00.000Z");
  for (const [date, time] of [["20260230", "0900"], ["20261113", "2400"], ["20261113", "0960"], ["20261025", "0230"], ["20260329", "0230"], ["bad", "0900"]]) assert.equal(collectAndGoInstant(date, time), null);
});
it("requires provider permission, known reservation status, unlocked state and a strictly future cutoff", () => {
  const cutoff = Date.parse("2026-11-13T08:00:00Z");
  assert.equal(parseCollectAndGoOrder(summary(), "1", cutoff - 1).editState, "open");
  assert.equal(parseCollectAndGoOrder(summary(), "1", cutoff).editState, "closed");
  assert.equal(parseCollectAndGoOrder({ ...summary(), x_isAmendable: "false" }, "1", cutoff - 1).editState, "closed");
  assert.equal(parseCollectAndGoOrder({ ...summary(), locked: "true" }, "1", cutoff - 1).editState, "closed");
  assert.equal(parseCollectAndGoOrder({ ...summary(), orderStatus: "C" }, "1", cutoff - 1).editState, "closed");
  for (const changed of [{ x_isAmendable: undefined }, { locked: undefined }, { x_aortDate: undefined }, { x_aortTime: "invalid" }, { orderStatus: "Z" }]) assert.equal(parseCollectAndGoOrder({ ...summary(), ...changed }, "1", cutoff - 1).editState, "unknown");
  // Retailer-specific Monday/holiday deadlines are preserved, never recomputed from pickup day.
  const monday = parseCollectAndGoOrder({ ...summary(), x_aortDate: "20261114", x_handoverDate: "20261116" }, "1", cutoff);
  assert.equal(monday.amendableUntil, "2026-11-14T08:00:00.000Z");
  assert.equal(monday.pickupFrom, "2026-11-16T07:30:00.000Z");
});
it("keeps pending carts and other buyers out of reservation results and excludes private profile fields", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async (input: URL | RequestInfo, init?: RequestInit) => {
    calls++; assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined); assert.equal(init?.redirect, "error");
    const url = new URL(String(input)); assert.equal(url.origin, "https://apip.collectandgo.be");
    return Response.json(url.pathname.endsWith("cart/@self") ? cart() : history([{ ...summary(), orderId: "10", orderStatus: "P" }, summary()]));
  });
  const orders = await fetchCollectAndGoOrders(state, signal());
  assert.deepEqual(orders.orders.map((order) => order.id), ["11"]); assert.equal(orders.truncated, false); assert.equal(orders.timeZone, "Europe/Brussels"); assert.equal(calls, 2);
  assert.ok(!JSON.stringify(orders).includes("private"));
  assert.throws(() => parseCollectAndGoOrder({ ...summary(), buyerId: "other" }, "1"));
  assert.throws(() => parseCollectAndGoOrder({ ...summary(), orderStatus: "P" }, "1"));
});
it("reads observed order details only via the fixed order GET and sanitizes product quantities/prices", async () => {
  mock.method(globalThis, "fetch", async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input)); assert.equal(url.pathname, "/gateway/ecomfoodb2c.eshop.wcsordersvcv2/v2/store/2/order/11"); assert.equal(url.searchParams.get("pageSize"), "100"); assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined);
    return Response.json(detail());
  });
  const result = await fetchCollectAndGoOrder(state, "11", signal());
  assert.deepEqual(result.items, [{ name: "Example bread", quantity: 2, unitPriceCents: 48, url: null }]); assert.equal(result.estimatedTotalCents, 1250); assert.equal(result.truncated, false); assert.ok(!JSON.stringify(result).includes("private"));
  for (const id of ["../cart", "@history", "11?anything=1", "https://attacker.example"]) await assert.rejects(fetchCollectAndGoOrder(state, id, signal()));
});
it("paginates history and order products, validates offsets and refuses changing or repeated records", async () => {
  for (const kind of ["history", "detail"] as const) {
    let calls = 0;
    mock.restoreAll(); mock.method(globalThis, "fetch", async (input: URL | RequestInfo) => {
      const url = new URL(String(input)); if (url.pathname.endsWith("cart/@self")) return Response.json(cart());
      const page = Number(url.searchParams.get("pageNumber")); calls++;
      const rows = Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => kind === "history" ? { ...summary(), orderId: String(page * 100 + index) } : item(String(page * 100 + index)));
      return Response.json({ ...(kind === "history" ? history(rows) : { ...detail(), orderItem: rows }), recordSetCount: String(rows.length), recordSetTotal: "101", recordSetStartNumber: page === 1 ? "0" : "100" });
    });
    const result = kind === "history" ? await fetchCollectAndGoOrders(state, signal()) : await fetchCollectAndGoOrder(state, "11", signal());
    assert.equal("orders" in result ? result.orders.length : result.items.length, 101); assert.equal(calls, 2); assert.equal(result.truncated, false);
  }
  mock.restoreAll(); mock.method(globalThis, "fetch", async () => Response.json({ ...detail(), orderItem: [item(), item()], recordSetCount: "2", recordSetTotal: "2" })); await assert.rejects(fetchCollectAndGoOrder(state, "11", signal()));
  mock.restoreAll(); mock.method(globalThis, "fetch", async () => Response.json({ ...detail(), recordSetTotal: "2" })); await assert.rejects(fetchCollectAndGoOrder(state, "11", signal()), "short page must not silently drop products");
});
it("rejects guest/foreign/mismatched details, invalid rows and unsupported currencies", async () => {
  for (const changes of [{ buyerId: "other" }, { orderId: "12" }, { resourceName: "cart" }, { orderStatus: "P" }, { recordSetStartNumber: "100" }, { orderItem: [{ ...item(), quantity: "0" }] }, { orderItem: [{ ...item(), currency: "USD" }] }]) {
    mock.restoreAll(); mock.method(globalThis, "fetch", async () => Response.json({ ...detail(), ...changes })); await assert.rejects(fetchCollectAndGoOrder(state, "11", signal()));
  }
});
it("only reports an empty history after verifying a signed-in basket, and stops on bot checks", async () => {
  mock.method(globalThis, "fetch", async (input: URL | RequestInfo) => Response.json(String(input).includes("cart/@self") ? cart() : history([])));
  assert.deepEqual((await fetchCollectAndGoOrders(state, signal())).orders, []);
  mock.restoreAll(); mock.method(globalThis, "fetch", async () => new Response("synthetic-token", { status: 456 }));
  await assert.rejects(fetchCollectAndGoOrder(state, "11", signal()), (error: unknown) => error instanceof Error && /browser verification/.test(error.message) && !error.message.includes("synthetic-token"));
});
it("marks bounded history partial and refuses revisions changing between product pages", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async (input: URL | RequestInfo) => {
    const url = new URL(String(input)); if (url.pathname.endsWith("cart/@self")) return Response.json(cart());
    calls++; const page = Number(url.searchParams.get("pageNumber"));
    return Response.json({ ...history(Array.from({ length: 100 }, (_, index) => ({ ...summary(), orderId: String(page * 100 + index) }))), recordSetTotal: "501", recordSetStartNumber: String((page - 1) * 100) });
  });
  const result = await fetchCollectAndGoOrders(state, signal()); assert.equal(result.orders.length, 500); assert.equal(result.truncated, true); assert.equal(calls, 5);
  mock.restoreAll(); mock.method(globalThis, "fetch", async (input: URL | RequestInfo) => {
    const page = Number(new URL(String(input)).searchParams.get("pageNumber"));
    return Response.json({ ...detail(), lastUpdateDate: page === 1 ? "revision-before" : "revision-after", orderItem: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => item(String(page * 100 + index))), recordSetCount: page === 1 ? "100" : "1", recordSetTotal: "101", recordSetStartNumber: page === 1 ? "0" : "100" });
  });
  await assert.rejects(fetchCollectAndGoOrder(state, "11", signal()));
});
