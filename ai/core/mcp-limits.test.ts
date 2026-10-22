import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import express from "express";
import { z } from "zod";
import { createMcpRouter, MCP_LIMITS } from "./mcp.routes";
import { registerAssistantTool, unregisterAssistantTool } from "./tools";
import type { TokenIdentity } from "./assistant.service";

const read = registerAssistantTool({
  name: "mcplimit.read", description: "Read a fixture", input: z.object({}), permission: "read", confirm: "never",
  activity: { en: "Read", nl: "Gelezen" }, run: () => ({ ok: true }),
});
after(() => ["mcplimit.read", "mcplimit.held", "mcplimit.fails", "mcplimit.abort"].forEach(unregisterAssistantTool));

const identity = (token: string): TokenIdentity => ({
  tokenId: token, tokenName: "test", scope: "write",
  user: { id: token.startsWith("a") ? "a" : "b", name: "Test", email: "test@example.com", role: "adult", locale: "nl", householdId: "h1", householdName: "Test", habitantId: null },
});
const rpc = (method = "tools/call", name = read.wireName) => ({ jsonrpc: "2.0", id: 17, method, params: method === "tools/call" ? { name, arguments: {} } : {} });
type Options = NonNullable<Parameters<typeof createMcpRouter>[0]>;
async function withServer(options: Options, run: (post: (body: unknown, token?: string, signal?: AbortSignal) => Promise<Response>) => Promise<void>) {
  const app = express();
  app.use("/api/mcp", createMcpRouter({ authenticate: async (token) => token === "invalid" ? null : identity(token), ...options }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mcp`;
  try {
    await run((body, token = "a", signal) => fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body), signal }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("MCP HTTP import limits", () => {
  it("allows sustained traffic beyond the old 300/15-minute ceiling", async () => {
    let now = 0;
    await withServer({ now: () => now }, async (post) => {
      for (let i = 0; i < 400; i += 1) {
        if (i === 200) now += MCP_LIMITS.windowMs;
        const response = await post(rpc());
        assert.equal(response.status, 200, `request ${i + 1}`);
        await response.text();
      }
    });
  });

  it("returns JSON-RPC 429 with Retry-After, isolates people and survives token refresh", async () => {
    let now = 0;
    await withServer({ limits: { requests: 2 }, now: () => now }, async (post) => {
      assert.equal((await post(rpc())).status, 200);
      assert.equal((await post(rpc())).status, 200);
      now = 12_001;
      const limited = await post(rpc(), "a-refreshed");
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("Retry-After"), "48");
      const body = await limited.json() as { jsonrpc: string; id: number; error: { code: number; data: { retryAfterSeconds: number } } };
      assert.equal(body.jsonrpc, "2.0");
      assert.equal(body.id, 17);
      assert.equal(body.error.code, -32029);
      assert.equal(body.error.data.retryAfterSeconds, 48);
      assert.equal((await post(rpc(), "b")).status, 200);
      now = 60_000;
      assert.equal((await post(rpc())).status, 200);
    });
  });

  it("retains failed-authentication limits without blocking valid users on that IP", async () => {
    await withServer({ limits: { failedAuthentication: 1 } }, async (post) => {
      const invalid = await post(rpc(), "invalid");
      assert.equal(invalid.status, 401);
      assert.match(invalid.headers.get("WWW-Authenticate") ?? "", /invalid_token/);
      const limited = await post(rpc(), "invalid");
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("Retry-After")) > 0);
      assert.equal((await post(rpc())).status, 200);
    });
  });

  it("caps concurrent tool calls, leaves metadata available and releases slots", async () => {
    let release!: () => void;
    let started!: () => void;
    let count = 0;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { started = resolve; });
    registerAssistantTool({ ...read, name: "mcplimit.held", run: async () => { if (++count === 2) started(); await gate; return { ok: true }; } });
    await withServer({ limits: { concurrentTools: 2 } }, async (post) => {
      const pending = [post(rpc("tools/call", "mcplimit_held")), post(rpc("tools/call", "mcplimit_held"))];
      try {
        await ready;
        const limited = await post(rpc());
        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get("Retry-After"), "1");
        assert.equal((await post(rpc("ping"))).status, 200);
      } finally {
        release();
        assert.ok((await Promise.all(pending)).every((response) => response.status === 200));
      }
      assert.equal((await post(rpc())).status, 200);
    });
  });

  it("releases the slot when a tool fails or the caller disconnects", async () => {
    registerAssistantTool({ ...read, name: "mcplimit.fails", run: () => { throw new Error("fixture failure"); } });
    let started!: () => void;
    let finished!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const done = new Promise<void>((resolve) => { finished = resolve; });
    registerAssistantTool({ ...read, name: "mcplimit.abort", run: async (ctx) => {
      started();
      try { await new Promise<void>((_resolve, reject) => ctx.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })); }
      finally { finished(); }
    } });
    await withServer({ limits: { concurrentTools: 1 } }, async (post) => {
      assert.equal((await (await post(rpc("tools/call", "mcplimit_fails"))).json() as { result: { isError: boolean } }).result.isError, true);
      assert.equal((await post(rpc())).status, 200);
      const controller = new AbortController();
      const pending = post(rpc("tools/call", "mcplimit_abort"), "a", controller.signal).catch(() => undefined);
      await ready;
      controller.abort();
      await pending;
      await done;
      assert.equal((await post(rpc())).status, 200);
    });
  });

  it("accepts recipe-sized bodies above 256 KB and rejects oversized/malformed requests as JSON-RPC", async () => {
    await withServer({}, async (post) => {
      assert.equal((await post({ ...rpc("ping"), params: { text: "x".repeat(300_000) } })).status, 200);
      const oversized = await post({ ...rpc("ping"), params: { text: "x".repeat(2_100_000) } });
      assert.equal(oversized.status, 413);
      assert.match(JSON.stringify(await oversized.json()), /smaller recipe batch/);
      const malformed = await post('{"jsonrpc":');
      assert.equal(malformed.status, 400);
      assert.equal((await malformed.json() as { error: { code: number } }).error.code, -32700);
    });
  });
});
