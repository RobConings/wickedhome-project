import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../skills";
import "./core-tools";
import { handleMcpMessage } from "./mcp.routes";
import { skillsForRole } from "./skills";
import type { TokenIdentity } from "./assistant.service";

const identity: TokenIdentity = {
  tokenId: "guides", tokenName: "Test", scope: "read",
  user: { id: "guide-user", name: "Rob", email: "test@example.com", role: "adult", locale: "en", householdId: "guide-household", householdName: "Test", habitantId: null },
};
const signal = new AbortController().signal;
const rpc = (method: string, params?: Record<string, unknown>, who = identity) =>
  handleMcpMessage({ jsonrpc: "2.0", id: 1, method, params }, who, signal);
async function call(name: string, args: Record<string, unknown>, who = identity) {
  const response = await rpc("tools/call", { name, arguments: args }, who) as { result: { isError: boolean; content: { text: string }[] } };
  assert.equal(response.result.isError, false, response.result.content[0]?.text);
  return JSON.parse(response.result.content[0]!.text);
}

describe("MCP workflow knowledge", () => {
  it("exposes every permitted area's actual guide through skills_load, including read-only connections", async () => {
    for (const skill of skillsForRole(identity.user.role)) {
      const result = await call("skills_load", { skills: [skill.id] });
      assert.deepEqual(result.guides, [{ skill: skill.id, guide: skill.guide }]);
      assert.match(result.note, /connection/);
    }
  });

  it("returns all three related workflow guides for groceries and cooking", async () => {
    const result = await call("skills_load", { skills: ["shopping", "inventory", "recipes"] });
    assert.deepEqual(result.guides.map((guide: { skill: string }) => guide.skill), ["shopping", "inventory", "recipes"]);
    assert.match(result.guides[0].guide, /inventory_products/);
    assert.match(result.guides[2].guide, /recipes_plan/);
  });

  it("returns the guide and callable tool names through app_help", async () => {
    const result = await call("app_help", { skill: "shopping" });
    assert.match(result.guide, /unlinkedReason/);
    assert.ok(result.tools.some((tool: { name: string }) => tool.name === "shopping_add_item"));
  });

  it("does not expose restricted guides to children", async () => {
    const child: TokenIdentity = { ...identity, user: { ...identity.user, role: "child" } };
    const restricted = skillsForRole("adult").find((skill) => !skill.roles.includes("child"));
    assert.ok(restricted);
    const response = await rpc("tools/call", { name: "skills_load", arguments: { skills: [restricted.id] } }, child) as { result: { isError: boolean; content: { text: string }[] } };
    assert.equal(response.result.isError, true);
    assert.doesNotMatch(response.result.content[0]!.text, /"guides"/);
    const help = await call("app_help", { skill: restricted.id }, child);
    assert.ok(help.error);
    assert.equal(help.guide, undefined);
  });

  it("teaches the connected-record workflows at initialization and points writes to their guide", async () => {
    const init = await rpc("initialize") as { result: { instructions: string } };
    for (const name of ["skills_load", "inventory_products", "inventory_stock", "shopping_list", "recipes_match", "recipes_save", "recipes_plan", "recipes_use"]) {
      assert.ok(init.result.instructions.includes(name), name);
    }
    const writable: TokenIdentity = { ...identity, scope: "write" };
    const listed = await rpc("tools/list", undefined, writable) as { result: { tools: { name: string; description: string; annotations: { readOnlyHint: boolean } }[] } };
    for (const tool of listed.result.tools.filter((tool) => !tool.annotations.readOnlyHint)) {
      assert.match(tool.description, /workflow guide \(skills_load\)/, tool.name);
    }
  });
});
