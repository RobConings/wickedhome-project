import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { SessionUser } from "@/features/auth/types/auth";
import { config } from "../lib/config";
import { requireAppHeader, errorHandler } from "../lib/http";
import { collectAndGoRouter } from "./collect-and-go.routes";
import { readCollectAndGoSession } from "./collect-and-go-session";
const app = express(); app.use(express.json()); app.use(requireAppHeader);
app.use((req, _res, next) => { const id = req.header("test-user"); if (id) req.user = { id, householdId: "home", role: id === "child" ? "child" : "adult", email: `${id}@example.test`, name: id, locale: "en", householdName: "Home", habitantId: null } satisfies SessionUser; next(); });
app.use("/collect", collectAndGoRouter); app.use(errorHandler);
const server = app.listen(); let origin = "", directory = "";
const previous = { storage: config.STORAGE_DIR, key: config.INTEGRATIONS_KEY };
const state = { cookies: [{ name: "shop-session", value: "private-import-value", domain: "www.collectandgo.be", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [] };
const call = (path: string, method = "GET", body?: unknown, user?: string, csrf = true) => fetch(`${origin}/collect${path}`, { method, headers: { "Content-Type": "application/json", ...(user && { "test-user": user }), ...(csrf && { "X-WickedHome": "1" }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
before(async () => { if (!server.listening) await new Promise<void>((done) => server.once("listening", done)); const address = server.address(); if (!address || typeof address === "string") throw new Error("address"); origin = `http://127.0.0.1:${address.port}`; directory = await mkdtemp(join(tmpdir(), "collectandgo-http-")); config.STORAGE_DIR = join(directory, "files"); config.INTEGRATIONS_KEY = Buffer.alloc(32, 2).toString("base64"); });
after(async () => { await new Promise<void>((done) => server.close(() => done())); config.STORAGE_DIR = previous.storage; config.INTEGRATIONS_KEY = previous.key; await rm(directory, { recursive: true, force: true }); });
it("requires authentication, CSRF and an adult role for browser-session imports", async () => {
  assert.equal((await call("/session", "POST", state)).status, 401);
  assert.equal((await call("/session", "POST", state, "alice", false)).status, 403);
  assert.equal((await call("/session", "POST", state, "child")).status, 403);
});
it("imports through the app without opening a browser and keeps sessions personal and out of responses", async () => {
  const result = await call("/session", "POST", state, "alice"); assert.equal(result.status, 200);
  const text = await result.text(); assert.ok(!text.includes("private-import-value")); assert.equal(JSON.parse(text).verified, undefined);
  assert.equal((await readCollectAndGoSession("alice"))?.state.cookies[0]?.value, "private-import-value");
  assert.equal(await readCollectAndGoSession("bob"), null);
  assert.equal((await call("/status", "GET", undefined, "bob").then((response) => response.json())).connected, false);
});
it("refuses unrelated cookie domains and removes the imported session on disconnect", async () => {
  assert.equal((await call("/session", "POST", { ...state, cookies: [{ ...state.cookies[0], domain: "attacker.test" }] }, "alice")).status, 400);
  assert.equal((await call("/session", "DELETE", undefined, "alice")).status, 204);
  assert.equal(await readCollectAndGoSession("alice"), null);
});
