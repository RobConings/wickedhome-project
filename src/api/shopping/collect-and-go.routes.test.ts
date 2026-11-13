import assert from "node:assert/strict";
import { after, before, it, mock } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { SessionUser } from "@/features/auth/types/auth";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { requireAppHeader, errorHandler } from "../lib/http";
import { collectAndGoRouter } from "./collect-and-go.routes";
import { readCollectAndGoConnection } from "./collect-and-go-connection";
import { saveCollectAndGoSession } from "./collect-and-go-session";
const app = express(); app.use(express.json()); app.use(requireAppHeader);
app.use((req, _res, next) => { const id = req.header("test-user"); if (id) req.user = { id, householdId: "home", role: id === "owner" ? "owner" : id === "child" ? "child" : "adult", email: `${id}@example.test`, name: id, locale: "en", householdName: "Home", habitantId: null } satisfies SessionUser; next(); });
app.use("/collect", collectAndGoRouter); app.use(errorHandler);
const server = app.listen(); let origin = "", directory = "";
const previous = { storage: config.STORAGE_DIR, key: config.INTEGRATIONS_KEY, members: Reflect.get(db.user, "findMany"), audit: Reflect.get(db.auditEntry, "create") };
const state = { cookies: [{ name: "shop-session", value: "private-import-value", domain: "www.collectandgo.be", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [] };
const input = { state, userIds: ["owner", "wife"] };
const call = (path: string, method = "GET", body?: unknown, user?: string, csrf = true) => fetch(`${origin}/collect${path}`, { method, headers: { "Content-Type": "application/json", ...(user && { "test-user": user }), ...(csrf && { "X-WickedHome": "1" }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
before(async () => {
  if (!server.listening) await new Promise<void>((done) => server.once("listening", done)); const address = server.address(); if (!address || typeof address === "string") throw new Error("address"); origin = `http://127.0.0.1:${address.port}`;
  directory = await mkdtemp(join(tmpdir(), "collectandgo-http-")); config.STORAGE_DIR = join(directory, "files"); config.INTEGRATIONS_KEY = Buffer.alloc(32, 2).toString("base64");
  Reflect.set(db.user, "findMany", async () => ["owner", "wife", "child"].map((id) => ({ id, email: `${id}@example.test`, role: id === "child" ? "CHILD" : id === "owner" ? "OWNER" : "ADULT", habitant: { name: id } })));
  Reflect.set(db.auditEntry, "create", async () => ({}));
});
after(async () => { await new Promise<void>((done) => server.close(() => done())); config.STORAGE_DIR = previous.storage; config.INTEGRATIONS_KEY = previous.key; Reflect.set(db.user, "findMany", previous.members); Reflect.set(db.auditEntry, "create", previous.audit); await rm(directory, { recursive: true, force: true }); });
it("requires authentication, CSRF and an owner for shared-session imports", async () => {
  assert.equal((await call("/session", "POST", input)).status, 401);
  assert.equal((await call("/session", "POST", input, "owner", false)).status, 403);
  assert.equal((await call("/session", "POST", input, "wife")).status, 403);
  assert.equal((await call("/session", "POST", input, "child")).status, 403);
});
it("imports once for the selected accounts without exposing credentials or claiming verified basket access", async () => {
  assert.equal((await call("/session", "POST", state, "owner")).status, 400, "old clients cannot silently create a shared connection without explicit grants");
  const result = await call("/session", "POST", input, "owner"); assert.equal(result.status, 200);
  const text = await result.text(); assert.ok(!text.includes("private-import-value")); assert.equal(JSON.parse(text).verified, undefined);
  assert.equal((await readCollectAndGoConnection("home"))?.state.cookies[0]?.value, "private-import-value");
  const wife = await call("/status", "GET", undefined, "wife").then((response) => response.json());
  assert.equal(wife.canUse, true); assert.equal(wife.canManage, false); assert.deepEqual(wife.members, []);
  assert.equal((await call("/status", "GET", undefined, "child").then((response) => response.json())).canUse, false);
});
it("changes access only for active household members and only through an owner", async () => {
  assert.equal((await call("/access", "PUT", { userIds: [] }, "wife")).status, 403);
  assert.equal((await call("/access", "PUT", { userIds: ["foreign"] }, "owner")).status, 400);
  assert.equal((await call("/access", "PUT", { userIds: ["owner"] }, "owner")).status, 200);
  assert.equal((await call("/status", "GET", undefined, "wife").then((response) => response.json())).canUse, false);
  assert.equal((await call("/session", "DELETE", undefined, "wife")).status, 403);
});
it("does not automatically share a legacy session, and lets an owner adopt it explicitly", async () => {
  assert.equal((await call("/session", "DELETE", undefined, "owner")).status, 204);
  await saveCollectAndGoSession("owner", state);
  const status = await call("/status", "GET", undefined, "owner").then((response) => response.json());
  assert.equal(status.connected, false); assert.equal(status.legacyAvailable, true);
  assert.equal((await call("/session/adopt", "POST", { userIds: ["owner", "wife"] }, "wife")).status, 403);
  assert.equal((await call("/session/adopt", "POST", { userIds: ["owner", "wife"] }, "owner")).status, 200);
  assert.equal((await call("/status", "GET", undefined, "wife").then((response) => response.json())).canUse, true);
});
it("authenticates cart reads/checks, enforces selected accounts and honours the browser feature flag", async () => {
  const enabled = process.env.COLLECTANDGO_ENABLED; process.env.COLLECTANDGO_ENABLED = "0";
  try {
    assert.equal((await call("/cart")).status, 401);
    assert.equal((await call("/check", "POST", {}, "wife", false)).status, 403);
    assert.equal((await call("/cart", "GET", undefined, "child")).status, 403);
    assert.equal((await call("/cart", "GET", undefined, "wife")).status, 409);
    assert.equal((await call("/check", "POST", {}, "wife")).status, 409, "selected adults can test access without being an owner");
  } finally { if (enabled === undefined) delete process.env.COLLECTANDGO_ENABLED; else process.env.COLLECTANDGO_ENABLED = enabled; }
});

it("protects reservation routes with authentication and the same selected-account grants", async () => {
  for (const path of ["/orders", "/orders/11", "/activity"]) {
    assert.equal((await call(path)).status, 401);
    assert.equal((await call(path, "GET", undefined, "child")).status, 403);
    assert.equal((await call(path, "GET", undefined, "wife")).status, 409, "browser-only session cannot prove native reservation access");
  }
  assert.equal((await call("/orders/not-an-order", "GET", undefined, "wife")).status, 400);
});

it("lets an allowed person explicitly test a paused native session without reimporting the HAR", async () => {
 const native = { ...state, cookies: [{ ...state.cookies[0]!, name: "WC_AUTHENTICATION_1", domain: "apip.collectandgo.be" }], cartApi: { storeId: "1", catalogId: "2", langId: "-11", authToken: "fixture-token", apiKey: "fixture-key" } };
 assert.equal((await call("/session","POST",{state:native,userIds:["wife"]},"owner")).status,200);
 const original=globalThis.fetch;let blocked=true,requests=0;
 const intercept=mock.method(globalThis,"fetch",async(input:URL|RequestInfo, options?:RequestInit)=>{
  if(!String(input).startsWith("https://apip.collectandgo.be/"))return original(input,options);
  requests++;
  return blocked?new Response("<title>Colruyt | AntiBot</title>",{status:405,headers:{"Content-Type":"text/html"}}):Response.json({resourceName:"cart",orderId:"1",orderStatus:"P",x_xtraEmailId:"fixture@example.test",totalProductPriceCurrency:"EUR",recordSetCount:"0",recordSetTotal:"0",recordSetStartNumber:"0"});
 });
 try {
  assert.equal((await call("/cart","GET",undefined,"wife")).status,409);
  assert.equal((await call("/status","GET",undefined,"wife").then(response=>response.json())).reconnectReason,"challenge");
  assert.equal((await call("/cart","GET",undefined,"wife")).status,409);assert.equal(requests,1);
  blocked=false;
  const result=await call("/check","POST",{},"wife");assert.equal(result.status,200);const data=await result.json();assert.equal(data.status.needsReconnect,false);assert.deepEqual(data.cart.items,[]);assert.equal(requests,2);
 }finally{intercept.mock.restore();}
});
