/**
 * The MCP server's JSON-RPC handling: initialize, tools/list (read-only tokens see only reads; write tools
 * get a `confirm` argument), tools/call (writes do nothing without `confirm: true`). No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/mcp.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { z } from "zod";
import type { TokenIdentity } from "./assistant.service";
import { SUPPORTED_PROTOCOL_VERSIONS, handleMcpMessage } from "./mcp.routes";
import { registerAssistantTool, unregisterAssistantTool } from "./tools";

const added: string[] = [];
const tools = [
  registerAssistantTool({
    name: "mcptest.read",
    description: "Read something.",
    input: z.object({ q: z.string().optional() }),
    permission: "read",
    confirm: "never",
    activity: { en: "Read", nl: "Gelezen" },
    run: (ctx) => ({ hello: ctx.user.name, channel: ctx.channel }),
  }),
  registerAssistantTool({
    name: "mcptest.add",
    description: "Add something.",
    input: z.object({ name: z.string().min(1) }),
    permission: "write",
    confirm: "first-time",
    activity: { en: "Added", nl: "Toegevoegd" },
    describe: (_ctx, input) => `Add ${input.name}`,
    run: (_ctx, input) => {
      added.push(input.name);
      return { added: input.name };
    },
  }),
];
after(() => tools.forEach((tool) => unregisterAssistantTool(tool.name)));

const identity = (scope: "read" | "write", role: "owner" | "adult" | "child" = "adult"): TokenIdentity => ({
  tokenId: "t1",
  tokenName: "test",
  scope,
  user: { id: "u1", email: "rob@example.com", name: "Rob", role, locale: "en", householdId: "h1", householdName: "Test", habitantId: null },
});

const signal = new AbortController().signal;
const rpc = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: "2.0" as const, id: 1, method, params });
type ToolList = { result: { tools: { name: string; inputSchema: { properties: Record<string, unknown> }; annotations: { readOnlyHint: boolean } }[] } };
type CallResult = { result: { content: { type: string; text: string }[]; isError: boolean } };

describe("MCP", () => {
  it("negotiates the protocol version", async () => {
    const response = (await handleMcpMessage(rpc("initialize", { protocolVersion: "2025-06-18" }), identity("read"), signal)) as { result: { protocolVersion: string; capabilities: object } };
    assert.equal(response.result.protocolVersion, "2025-06-18");
    assert.ok("tools" in response.result.capabilities);
    const unknown = (await handleMcpMessage(rpc("initialize", { protocolVersion: "1999-01-01" }), identity("read"), signal)) as { result: { protocolVersion: string } };
    assert.equal(unknown.result.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it("lists only read tools for a read-only token", async () => {
    const response = (await handleMcpMessage(rpc("tools/list"), identity("read"), signal)) as ToolList;
    const names = response.result.tools.map((tool) => tool.name);
    assert.ok(names.includes("mcptest_read"));
    assert.ok(!names.includes("mcptest_add"));
    assert.ok(response.result.tools.every((tool) => tool.annotations.readOnlyHint));
  });

  it("lists writes with a confirm argument for a write token", async () => {
    const response = (await handleMcpMessage(rpc("tools/list"), identity("write"), signal)) as ToolList;
    const add = response.result.tools.find((tool) => tool.name === "mcptest_add");
    assert.ok(add);
    assert.ok("confirm" in add.inputSchema.properties);
    assert.equal(add.annotations.readOnlyHint, false);
  });

  it("calls a read tool as the token's person", async () => {
    const response = (await handleMcpMessage(rpc("tools/call", { name: "mcptest_read", arguments: {} }), identity("read"), signal)) as CallResult;
    assert.equal(response.result.isError, false);
    assert.deepEqual(JSON.parse(response.result.content[0]?.text ?? "null"), { hello: "Rob", channel: "mcp" });
  });

  it("does nothing for a write without confirm: true, and runs it with", async () => {
    added.splice(0);
    const without = (await handleMcpMessage(rpc("tools/call", { name: "mcptest_add", arguments: { name: "milk" } }), identity("write"), signal)) as CallResult;
    assert.equal(without.result.isError, true);
    assert.match(without.result.content[0]?.text ?? "", /Add milk/);
    assert.deepEqual(added, []);
    const confirmed = (await handleMcpMessage(rpc("tools/call", { name: "mcptest_add", arguments: { name: "milk", confirm: true } }), identity("write"), signal)) as CallResult;
    assert.equal(confirmed.result.isError, false);
    assert.deepEqual(added, ["milk"]);
  });

  it("refuses writes for read tokens and for roles without access", async () => {
    const read = (await handleMcpMessage(rpc("tools/call", { name: "mcptest_add", arguments: { name: "x", confirm: true } }), identity("read"), signal)) as { error?: { code: number } };
    assert.equal(read.error?.code, -32602);
    const child = (await handleMcpMessage(rpc("tools/call", { name: "mcptest_add", arguments: { name: "x", confirm: true } }), identity("write", "child"), signal)) as { error?: { code: number } };
    assert.equal(child.error?.code, -32602);
    assert.ok(!added.includes("x"));
  });

  it("answers unknown methods with -32601", async () => {
    const response = (await handleMcpMessage(rpc("resources/list"), identity("read"), signal)) as { error?: { code: number } };
    assert.equal(response.error?.code, -32601);
  });
});
