import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../skills";
import "./core-tools";
import { handleMcpMessage, mcpToolOf } from "./mcp.routes";
import { getAssistantTool } from "./tools";
import { skillsForRole } from "./skills";
import { structuredResponseSchema } from "@/features/assistant/types/response-components";
import type { AssistantToolContext } from "./tools";
import type { CollectAndGoOrder } from "@/features/shopping/types/collect-and-go";
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

  it("delivers separate online promotion research instructions through MCP and Xtra tools", async () => {
    const init = await rpc("initialize") as { result: { instructions: string } };
    const loaded = await call("skills_load", { skills: ["shopping"] });
    const guidance = [init.result.instructions, loaded.guides[0].guide, ...["shopping.xtra_search", "shopping.xtra_add"].map((name) => mcpToolOf(getAssistantTool(name)!).description)];
    for (const text of guidance) {
      assert.match(text, /separately search|separate lookup/);
      assert.match(text, /promotions/);
      assert.match(text, /web_search/);
      assert.match(text, /web_read/);
      assert.match(text, /unverified/);
    }
  });

  it("keeps in-store Xtra lists and online Collect&Go baskets distinct in published guidance", async () => {
    const init = await rpc("initialize") as { result: { instructions: string } };
    const loaded = await call("skills_load", { skills: ["shopping", "shops"] });
    for (const text of [init.result.instructions, ...loaded.guides.map((guide: { guide: string }) => guide.guide)]) {
      assert.match(text, /Xtra\/Colruyt|Colruyt\/Xtra/);
      assert.match(text, /in-store|physical store/);
      assert.match(text, /Collect&Go/);
      assert.match(text, /online order|ordering online/);
      assert.match(text, /same retail group/);
      assert.match(text, /separate/);
    }
    for (const text of [init.result.instructions, loaded.guides[0].guide]) {
      assert.match(text, /intended channel is unclear/);
      assert.match(text, /explicit request and confirmation/);
    }
    for (const name of ["shopping.xtra_search", "shopping.xtra_list", "shopping.xtra_add", "shopping.xtra_remove"]) {
      assert.match(mcpToolOf(getAssistantTool(name)!).description, /in-store shopping/);
    }
    for (const name of ["shopping.collectandgo_search", "shopping.collectandgo_basket"]) {
      const tool = getAssistantTool(name)!;
      assert.match(mcpToolOf(tool).description, /online order/);
      if (name.endsWith("basket")) assert.equal(tool.confirm, "always");
    }
    const cart = getAssistantTool("shopping.collectandgo_cart")!;
    assert.equal(cart.permission, "read"); assert.equal(cart.confirm, "never");
    assert.match(mcpToolOf(cart).description, /signed-in/);
    assert.match(mcpToolOf(cart).description, /guest cart/i);
    assert.match(mcpToolOf(cart).description, /Never changes quantities/);
  });

  it("publishes separate read-only reservation tools and teaches cutoff-aware amendments", async () => {
    const init = await rpc("initialize") as { result: { instructions: string } };
    const loaded = await call("skills_load", { skills: ["shopping"] });
    for (const text of [init.result.instructions, loaded.guides[0].guide]) {
      assert.match(text, /shopping_collectandgo_orders/); assert.match(text, /shopping_collectandgo_order/);
      assert.match(text, /Europe\/Brussels/); assert.match(text, /amend/); assert.match(text, /cutoff/);
    }
    for (const name of ["shopping.collectandgo_orders", "shopping.collectandgo_order"]) {
      const tool = getAssistantTool(name)!;
      assert.equal(tool.permission, "read"); assert.equal(tool.confirm, "never");
      assert.match(mcpToolOf(tool).description, /pending basket/);
      assert.match(mcpToolOf(tool).description, /cutoff/);
    }
    const tool = getAssistantTool("shopping.collectandgo_order")!;
    assert.deepEqual(tool.input.parse({ orderId: "11" }), { orderId: "11" });
    assert.throws(() => tool.input.parse({ orderId: "../cart" }));
  });

  it("renders large retailer results with shared tables and reservation links in both languages", () => {
    const order: CollectAndGoOrder = { id: "11", url: "https://www.collectandgo.be/nl/bestelling/11", status: "M", pickupPoint: "Example", pickupFrom: "2026-11-14T07:30:00.000Z", pickupUntil: "2026-11-14T08:00:00.000Z", amendableUntil: "2026-11-13T08:00:00.000Z", providerAmendable: true, editState: "open", estimatedTotalCents: 1250 };
    const items = Array.from({ length: 250 }, () => ({ name: "Example", url: null, quantity: 2, unitPriceCents: 48 }));
    for (const locale of ["en", "nl"] as const) {
      const ctx: AssistantToolContext = { user: identity.user, householdId: identity.user.householdId, locale, signal, channel: "chat" };
      for (const [name, data] of [["shopping.collectandgo_orders", { orders: Array.from({ length: 250 }, () => order), observedAt: "now", truncated: false }], ["shopping.collectandgo_order", { ...order, items, observedAt: "now", truncated: false }], ["shopping.collectandgo_cart", { items, observedAt: "now", truncated: false }]] as const) {
        const presentation = structuredResponseSchema.parse(getAssistantTool(name)!.present!(ctx, {}, data));
        assert.equal(presentation.components.filter(component => component.type === "table").flatMap(component => component.rows).length, 250);
        if (name === "shopping.collectandgo_order") {
          const links = presentation.components.find(component => component.type === "links");
          assert.equal(links?.links[0]?.href, order.url);
        }
      }
    }
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
