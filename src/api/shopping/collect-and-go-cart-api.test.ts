import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";
import { fetchCollectAndGoCart, parseCollectAndGoCartResponse } from "./collect-and-go-cart-api";
import type { CollectAndGoState } from "@/features/shopping/types/collect-and-go";
// Shape from the real read response; all credentials, identifiers and product data below are synthetic.
const response = () => ({ resourceName: "cart", orderStatus: "P", orderId: "1", x_xtraEmailId: "fixture@example.test", totalProductPriceCurrency: "EUR", recordSetCount: "2", recordSetTotal: "2", recordSetStartNumber: "0", orderItem: [{ xitem_productName: "Example milk", currency: "EUR", quantity: "2.0", unitPrice: "1.62000" }, { xitem_productName: "Example apples", currency: "EUR", quantity: "1.5", unitPrice: "2.00000" }] });
const state: CollectAndGoState = { cookies: [{ name: "WC_AUTHENTICATION_1", value: "fixture-cookie", domain: "apip.collectandgo.be", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }, { name: "analytics", value: "not-needed", domain: "apip.collectandgo.be", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" }], origins: [], cartApi: { storeId: "1", catalogId: "2", langId: "-11", authToken: "fixture-auth-token", apiKey: "fixture-api-key" } };
afterEach(() => mock.restoreAll());
it("extracts only pending signed-in basket data, quantities and observed prices", () => {
 const result = parseCollectAndGoCartResponse(response());
 assert.equal(result.authenticated,true); assert.equal(result.truncated,false);
 assert.deepEqual(result.items,[{name:"Example milk",url:null,quantity:2,unitPriceCents:162},{name:"Example apples",url:null,quantity:1.5,unitPriceCents:200}]);
 assert.ok(!JSON.stringify(result).includes("fixture@example.test"));
 const empty={...response(),recordSetCount:"0",recordSetTotal:"0",orderItem:[]};assert.deepEqual(parseCollectAndGoCartResponse(empty).items,[]);
 assert.equal(parseCollectAndGoCartResponse({...response(),recordSetTotal:"3"}).truncated,true);
});
it("rejects guest responses, completed orders, unknown shapes and invalid quantities", () => {
 for(const raw of [{...response(),x_xtraEmailId:""},{...response(),orderStatus:"D"},{...response(),totalProductPriceCurrency:"USD"},{...response(),orderItem:undefined},{...response(),recordSetTotal:"1"},{...response(),orderItem:response().orderItem.map(i=>({...i,quantity:"0"}))}])assert.throws(()=>parseCollectAndGoCartResponse(raw),/did not prove access/);
 assert.equal(parseCollectAndGoCartResponse({...response(),orderItem:response().orderItem.map(i=>({...i,unitPrice:"unknown"}))}).items[0]?.unitPriceCents,null);
});
it("uses only the fixed read endpoint, credentials and GET, with no redirects or tracking cookies", async () => {
 let calls=0;mock.method(globalThis,"fetch",async(input: URL | RequestInfo,init?:RequestInit)=>{calls++;const url=new URL(String(input));assert.equal(url.origin,"https://apip.collectandgo.be");assert.ok(url.pathname.endsWith("/store/1/cart/@self"));assert.equal(init?.method,"GET");assert.equal(init?.body,undefined);assert.equal(init?.redirect,"error");const headers=new Headers(init?.headers);assert.equal(headers.get("WCAuthToken"),"fixture-auth-token");assert.equal(headers.get("Cookie"),"WC_AUTHENTICATION_1=fixture-cookie");return Response.json(response());});
 assert.equal((await fetchCollectAndGoCart(state,new AbortController().signal)).items.length,2);assert.equal(calls,1);
});
it("stops at authentication/challenge errors without echoing credentials or parsing the error page", async () => {
 for(const status of [401,403,456]){mock.restoreAll();mock.method(globalThis,"fetch",async()=>new Response("fixture-auth-token",{status}));await assert.rejects(fetchCollectAndGoCart(state,new AbortController().signal),(error:unknown)=>error instanceof Error&&!error.message.includes("fixture-auth-token"));}
});
