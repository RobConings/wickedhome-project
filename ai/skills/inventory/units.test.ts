import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import { db, Prisma } from "@/api/lib/db";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import { getAssistantTool, type AssistantToolContext } from "@ai/core/tools";
import type { UnitDefinition } from "@/types/units";
import "@ai/skills";
import "@ai/core/core-tools";

const user = { id: "rob", email: "test@example.com", name: "Rob", role: "adult" as const, locale: "nl" as const, householdId: "home", householdName: "Test", habitantId: null };
const signal = new AbortController().signal;
const context: AssistantToolContext = { user, householdId: user.householdId, locale: "nl", channel: "chat", signal };
const bottle: UnitDefinition = { name: "fles", referenceUnit: "cl", factor: 75, rounding: 1, aliases: [] };
type RpcResult = { result: { isError: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> }; error?: { code: number } };
const call = async (name: string, args: Record<string, unknown> = {}, scope: "read" | "write" = "read", role: "adult" | "child" = "adult") =>
  await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { tokenId: "test", tokenName: "Test", scope, user: { ...user, role } }, signal) as RpcResult;
function data(response: RpcResult) {
  assert.equal(response.result.isError, false, response.result.content[0]?.text);
  return response.result.structuredContent ?? JSON.parse(response.result.content[0]!.text) as Record<string, unknown>;
}
function stub(t: TestContext, target: object, key: string, implementation: unknown) {
  const original = Reflect.get(target, key);
  Reflect.set(target, key, implementation);
  t.after(() => Reflect.set(target, key, original));
}
function setup(t: TestContext, initial: UnitDefinition[] = [bottle]) {
  let units = initial;
  let revision: Date | null = new Date("2026-11-11T12:00:00Z");
  let writes = 0;
  stub(t, db.household, "findUnique", async ({ where }: { where: { id: string } }) => {
    assert.equal(where.id, user.householdId);
    return { unitDefinitions: units, unitDefinitionsUpdatedAt: revision };
  });
  stub(t, db.household, "updateMany", async ({ where, data }: { where: { id: string; unitDefinitionsUpdatedAt: Date | null }; data: { unitDefinitions: UnitDefinition[]; unitDefinitionsUpdatedAt: Date } }) => {
    assert.equal(where.id, user.householdId);
    if (where.unitDefinitionsUpdatedAt?.getTime() !== revision?.getTime()) return { count: 0 };
    units = data.unitDefinitions; revision = data.unitDefinitionsUpdatedAt; writes += 1;
    return { count: 1 };
  });
  stub(t, db.auditEntry, "create", async () => ({}));
  return { read: () => ({ units, revision, writes }) };
}

it("exposes unit knowledge through the same MCP guides and built-in chat tool", async (t) => {
  setup(t);
  const response = data(await call("skills_load", { skills: ["inventory", "recipes", "shopping"] }));
  for (const guide of response.guides as { guide: string }[]) {
    assert.match(guide.guide, /inventory_units/);
    assert.match(guide.guide, /[Cc]entral/);
    assert.match(guide.guide, /[Rr]ecorded.*0/);
    assert.match(guide.guide, /purchaseQuantityRequired/);
  }
  assert.ok((response.tools as string[]).includes("inventory_units"));
  const mcp = data(await call("inventory_units", { fromUnit: "flesje", toUnit: "cl", quantity: 2 }));
  const tool = getAssistantTool("inventory.units")!;
  const chat = await tool.run(context, tool.input.parse({ fromUnit: "flesje", toUnit: "cl", quantity: 2 }));
  assert.deepEqual(chat, mcp);
  assert.deepEqual(mcp.conversion, { quantity: 2, fromUnit: "flesje", toUnit: "cl", comparable: true, result: 150, dimension: "volume", purchaseRounding: 0.001 });
});

it("does not equate unconfigured bags and pieces and keeps zero separate from a known ratio", async (t) => {
  setup(t, []);
  const unknown = data(await call("inventory_units", { fromUnit: "stuk", toUnit: "zak", quantity: 4 })).conversion as { result: number | null; comparable: boolean };
  assert.equal(unknown.result, null); assert.equal(unknown.comparable, false);
  const zero = data(await call("inventory_units", { fromUnit: "stronkje", toUnit: "kg", quantity: 0 })).conversion as typeof unknown;
  assert.equal(zero.result, 0); assert.equal(zero.comparable, false);
});

it("saves central units through a confirmed, revision-checked MCP write without touching stock", async (t) => {
  const state = setup(t);
  stub(t, db.stockItem, "update", () => { throw new Error("A unit definition must never edit stock"); });
  const args = { expectedUpdatedAt: state.read().revision!.toISOString(), units: [bottle, { name: "doos van 6", referenceUnit: "stuk", factor: 6, rounding: 1, aliases: [] }] };
  assert.equal((await call("inventory_save_units", args, "write")).result.isError, true);
  assert.equal(state.read().writes, 0);
  const preview = await getAssistantTool("inventory.save_units")!.preview!(context, args);
  assert.match(JSON.stringify(preview), /75 cl/);
  data(await call("inventory_save_units", { ...args, confirm: true }, "write"));
  assert.equal(state.read().writes, 1); assert.deepEqual(state.read().units, args.units);
  const stale = await call("inventory_save_units", { ...args, confirm: true }, "write");
  assert.equal(stale.result.isError, true); assert.match(stale.result.content[0]!.text, /changed/); assert.equal(state.read().writes, 1);
  assert.equal((await call("inventory_save_units", { ...args, confirm: true }, "read")).error?.code, -32602);
  assert.equal((await call("inventory_save_units", { ...args, confirm: true }, "write", "child")).error?.code, -32602);
});

it("refuses invalid unit relationships before a confirmed MCP write", async (t) => {
  const state = setup(t);
  const invalid = await call("inventory_save_units", { expectedUpdatedAt: state.read().revision!.toISOString(), units: [{ ...bottle, referenceUnit: "fles" }], confirm: true }, "write");
  assert.equal(invalid.result.isError, true); assert.equal(state.read().writes, 0);
});

it("recipes_match uses central units and reports when an empty stock needs an explicit purchase quantity", async (t) => {
  const state = setup(t, []);
  const product = { id: "witloof", name: "Witloof", unit: "kg", householdId: user.householdId, packageAmount: null, packageUnit: null, category: "PRODUCE", isEssential: false, shopLinks: [], alternatives: [], stockItems: [{ unit: "kg" }], stockProduct: null, stockProductId: null };
  stub(t, db.product, "findMany", async () => [product]);
  stub(t, db.stockItem, "findMany", async () => [{ id: "stock", productId: product.id, product, placeId: "kitchen", place: { name: "Keuken" }, quantity: new Prisma.Decimal(0), unit: "kg", minQuantity: null, expiresOn: null, updatedAt: new Date() }]);
  const args = { ingredients: [{ name: "Witloof", quantity: 8, unit: "stronkje" }] };
  const before = (data(await call("recipes_match", args)).ingredients as Record<string, unknown>[])[0]!;
  assert.equal(before.stockEmpty, true); assert.equal(before.status, "short"); assert.equal(before.purchaseQuantityRequired, true); assert.equal(before.buy, null);
  data(await call("inventory_save_units", { expectedUpdatedAt: state.read().revision!.toISOString(), units: [{ name: "stronkje", referenceUnit: "g", factor: 150, rounding: 1, aliases: [] }], confirm: true }, "write"));
  const after = (data(await call("recipes_match", args)).ingredients as Record<string, unknown>[])[0]!;
  assert.equal(after.status, "short"); assert.equal(after.purchaseQuantityRequired, false); assert.equal(after.comparable, true); assert.equal(after.buy, "1,2 kg");
});
