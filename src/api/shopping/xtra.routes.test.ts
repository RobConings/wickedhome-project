import assert from "node:assert/strict";
import { after, before, it, mock } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { SessionUser } from "@/features/auth/types/auth";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { errorHandler, requireAppHeader } from "../lib/http";
import { xtraRouter } from "./xtra.routes";

const nativeFetch = globalThis.fetch;
const app = express(); app.use(express.json()); app.use(requireAppHeader);
app.use((req, _res, next) => { const id = req.header("test-user"); if (id) req.user = { id, householdId: "home", role: id === "owner" ? "owner" : "adult", locale: "en", name: id, email: `${id}@example.test`, householdName: "Home", habitantId: null } satisfies SessionUser; next(); });
app.use("/xtra", xtraRouter); app.use(errorHandler);
const server = app.listen();
let origin = "", directory = "";
const previous = { storage: config.STORAGE_DIR, key: config.INTEGRATIONS_KEY };
const restores: (() => void)[] = [];
const call = (path: string, method = "GET", body?: unknown, account?: string, csrf = true) => nativeFetch(`${origin}/xtra${path}`, { method, headers: { "Content-Type": "application/json", ...(csrf && { "X-WickedHome": "1" }), ...(account && { "test-user": account }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
before(async () => {
  if (!server.listening) await new Promise<void>((done) => server.once("listening", done));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address"); origin = `http://127.0.0.1:${address.port}`;
  directory = await mkdtemp(join(tmpdir(), "xtra-http-")); config.STORAGE_DIR = join(directory, "files"); config.INTEGRATIONS_KEY = Buffer.alloc(32, 4).toString("base64");
  for (const [target, key, replacement] of [[db.user, "findMany", async () => ["owner", "wife"].map((id) => ({ id, email: `${id}@example.test`, role: "ADULT", habitant: { name: id } }))], [db.product, "findMany", async () => []], [db.auditEntry, "create", async () => ({})]] as const) {
    const old = Reflect.get(target, key); Reflect.set(target, key, replacement); restores.push(() => Reflect.set(target, key, old));
  }
  mock.method(globalThis, "fetch", async (target: unknown) => {
    const search = String(target).includes("product-search-prs");
    return new Response(JSON.stringify(search ? { products: [] } : { items: [] }), { headers: { "Content-Type": "application/json" } });
  });
});
after(async () => { mock.restoreAll(); restores.forEach((restore) => restore()); await new Promise<void>((done) => server.close(() => done())); config.STORAGE_DIR = previous.storage; config.INTEGRATIONS_KEY = previous.key; await rm(directory, { recursive: true, force: true }); });
const input = { credentials: { sessionId: "http-secret-session", apiKey: "http-secret-api", placeId: "1234" }, userIds: ["owner", "wife"] };
it("requires a session, CSRF header and owner role to connect", async () => {
  assert.equal((await call("/status")).status, 401);
  assert.equal((await call("/connection", "POST", input, "owner", false)).status, 403);
  assert.equal((await call("/connection", "POST", input, "wife")).status, 403);
});
it("connects once for selected accounts and keeps secrets out of API responses", async () => {
  const connected = await call("/connection", "POST", input, "owner"); assert.equal(connected.status, 200);
  const response = await connected.text(); assert.ok(!response.includes(input.credentials.sessionId)); assert.ok(!response.includes(input.credentials.apiKey));
  const status = await call("/status", "GET", undefined, "wife"); assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await status.json()).canUse, true);
  assert.equal((await call("/products?query=milk", "GET", undefined, "wife")).status, 200);
  const list = await call("/list", "GET", undefined, "wife"); assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "no-store");
  assert.deepEqual((await list.json()).items, []);
  assert.equal((await call("/products?query=milk", "GET", undefined, "stranger")).status, 403);
});
it("enforces saved access changes for the product-form endpoint", async () => {
  assert.equal((await call("/access", "PUT", { userIds: ["owner"] }, "owner", false)).status, 403);
  assert.equal((await call("/access", "PUT", { userIds: ["owner"] }, "owner")).status, 200);
  assert.equal((await call("/products?query=milk", "GET", undefined, "wife")).status, 403);
  assert.equal((await call("/list?fresh=1", "GET", undefined, "wife")).status, 403);
  assert.equal((await call("/connection", "DELETE", undefined, "wife")).status, 403);
});
