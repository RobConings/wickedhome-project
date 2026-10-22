/**
 * Which assistant tool calls the runner records in the household audit log (moved from
 * src/api/audit/audit.test.ts with the assistant). No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/tool-audit.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { z } from "zod";
import type { SessionUser } from "@/features/auth/types/auth";
import { runTool } from "./assistant-loop";
import { registerAssistantTool, setAssistantToolAuditor, unregisterAssistantTool, type AssistantToolContext } from "./tools";

describe("assistant tool calls in the audit log", () => {
  const user: SessionUser = { id: "u1", email: "rob@example.com", name: "Rob", role: "adult", locale: "en", householdId: "h1", householdName: "Test", habitantId: null };
  const ctx = (channel: AssistantToolContext["channel"]): AssistantToolContext => ({ user, householdId: "h1", locale: "en", signal: new AbortController().signal, channel });
  const recorded: { tool: string; channel: string }[] = [];
  setAssistantToolAuditor(async (tool, context) => {
    recorded.push({ tool: tool.name, channel: context.channel });
  });
  after(() => {
    setAssistantToolAuditor(null);
    for (const name of ["audittest.read", "audittest.write", "audittest.fail", "audittest.self"]) unregisterAssistantTool(name);
  });

  const base = { input: z.object({}), activity: { en: "Did it", nl: "Gedaan" } };
  const read = registerAssistantTool({ ...base, name: "audittest.read", description: "Read.", permission: "read", confirm: "never", run: () => ({}) });
  const write = registerAssistantTool({ ...base, name: "audittest.write", description: "Write.", permission: "write", confirm: "first-time", run: () => ({ ok: true }) });
  const fail = registerAssistantTool({
    ...base,
    name: "audittest.fail",
    description: "Fails.",
    permission: "write",
    confirm: "always",
    run: () => {
      throw new Error("nope");
    },
  });
  const self = registerAssistantTool({ ...base, name: "audittest.self", description: "Self.", permission: "sensitive", confirm: "always", auditedByService: true, run: () => ({}) });

  it("records successful writes from the chat and MCP, nothing else", async () => {
    recorded.length = 0;
    await runTool(read, ctx("chat"), {});
    await runTool(write, ctx("chat"), {});
    await runTool(write, ctx("mcp"), {});
    await runTool(fail, ctx("chat"), {});
    await runTool(self, ctx("chat"), {});
    assert.deepEqual(recorded, [
      { tool: "audittest.write", channel: "chat" },
      { tool: "audittest.write", channel: "mcp" },
    ]);
  });

  it("a failing audit never fails the action", async () => {
    setAssistantToolAuditor(async () => {
      throw new Error("database down");
    });
    const result = await runTool(write, ctx("chat"), {});
    assert.equal(result.ok, true);
  });
});
