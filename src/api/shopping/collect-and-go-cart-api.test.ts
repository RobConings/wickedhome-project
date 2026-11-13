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
 assert.deepEqual(parseCollectAndGoCartResponse({...empty,orderItem:undefined}).items,[], "Live empty baskets omit the products array without expiring the login");
 assert.throws(()=>parseCollectAndGoCartResponse({...empty,orderItem:null}));
 assert.throws(()=>parseCollectAndGoCartResponse({...empty,orderItem:undefined,x_xtraEmailId:""}));
 assert.equal(parseCollectAndGoCartResponse({...response(),recordSetTotal:"3"}).truncated,true);
});
it("rejects guest responses, completed orders, unknown shapes and invalid quantities", () => {
 for(const raw of [{...response(),x_xtraEmailId:""},{...response(),orderStatus:"D"},{...response(),totalProductPriceCurrency:"USD"},{...response(),orderItem:undefined},{...response(),recordSetTotal:"1"},{...response(),orderItem:response().orderItem.map(i=>({...i,quantity:"0"}))}])assert.throws(()=>parseCollectAndGoCartResponse(raw),/could not be verified/);
 assert.equal(parseCollectAndGoCartResponse({...response(),orderItem:response().orderItem.map(i=>({...i,unitPrice:"unknown"}))}).items[0]?.unitPriceCents,null);
});
it("uses only the fixed read endpoint, credentials and GET, with no redirects or tracking cookies", async () => {
 let calls=0;mock.method(globalThis,"fetch",async(input: URL | RequestInfo,init?:RequestInit)=>{calls++;const url=new URL(String(input));assert.equal(url.origin,"https://apip.collectandgo.be");assert.ok(url.pathname.endsWith("/store/1/cart/@self"));assert.equal(init?.method,"GET");assert.equal(init?.body,undefined);assert.equal(init?.redirect,"error");const headers=new Headers(init?.headers);assert.equal(headers.get("WCAuthToken"),"fixture-auth-token");assert.equal(headers.get("Cookie"),"WC_AUTHENTICATION_1=fixture-cookie");return Response.json(response());});
 assert.equal((await fetchCollectAndGoCart(state,new AbortController().signal)).items.length,2);assert.equal(calls,1);
});
it("stops at authentication/challenge errors without echoing credentials or parsing the error page", async () => {
 for(const status of [401,403,456]){mock.restoreAll();mock.method(globalThis,"fetch",async()=>new Response("fixture-auth-token",{status}));await assert.rejects(fetchCollectAndGoCart(state,new AbortController().signal),(error:unknown)=>error instanceof Error&&!error.message.includes("fixture-auth-token"));}
});

it("recognizes the observed HTTP 405 AntiBot page and HTML challenges without exposing their contents", async () => {
 for(const status of [200,403,405]) {
  mock.restoreAll(); mock.method(globalThis,"fetch",async()=>new Response("<html><title>Colruyt | AntiBot</title>captcha fixture-auth-token</html>",{status,headers:{"Content-Type":"text/html; charset=UTF-8"}}));
  await assert.rejects(fetchCollectAndGoCart(state,new AbortController().signal),(error:unknown)=>error instanceof Error&&Reflect.get(error,"code")==="collectandgo_challenge"&&!error.message.includes("fixture-auth-token"));
 }
 mock.restoreAll();mock.method(globalThis,"fetch",async()=>Response.json({error:"Method not allowed"},{status:405}));
 await assert.rejects(fetchCollectAndGoCart(state,new AbortController().signal),{code:"collectandgo_unavailable"});
});

it("renews only from a verified basket, never from a guest response, error or challenge", async () => {
 const saved=structuredClone(state); let calls=0;
 mock.method(globalThis,"fetch",async(_input:unknown,options?:RequestInit)=>{
  assert.equal(new Headers(options?.headers).get("Cookie"),calls++ === 0 ? "WC_AUTHENTICATION_1=fixture-cookie" : "WC_AUTHENTICATION_1=renewed-cookie");
  return Response.json(response(),{headers:{"Set-Cookie":"WC_AUTHENTICATION_1=renewed-cookie; Path=/; Secure; HttpOnly"}});
 });
 await fetchCollectAndGoCart(saved,new AbortController().signal); await fetchCollectAndGoCart(saved,new AbortController().signal);
 assert.equal(calls,2); assert.equal(saved.cookies.find(c=>c.name==="WC_AUTHENTICATION_1")?.value,"renewed-cookie");
 for(const invalid of [()=>Response.json({...response(),x_xtraEmailId:""}),()=>Response.json({error:"expired"},{status:401}),()=>new Response("<title>Colruyt | AntiBot</title>",{status:405,headers:{"Content-Type":"text/html"}}),()=>Response.json({...response(),orderItem:[{...response().orderItem[0],quantity:"0"}]})]) {
  mock.restoreAll(); const original=structuredClone(saved);
  mock.method(globalThis,"fetch",async()=>{const result=invalid();result.headers.append("Set-Cookie","WC_AUTHENTICATION_1=unverified-cookie; Path=/; Secure");return result;});
  await assert.rejects(fetchCollectAndGoCart(saved,new AbortController().signal)); assert.deepEqual(saved,original);
 }
});
