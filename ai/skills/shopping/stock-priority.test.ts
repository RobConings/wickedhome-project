import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import type { SessionUser } from "@/features/auth/types/auth";
import { db, Prisma } from "@/api/lib/db";
import { resultForModel, runTool } from "@ai/core/assistant-loop";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import { invalidateEntityCache } from "@ai/core/resolve";
import { questionSkillIds } from "@ai/core/routing";
import { getAssistantSkill, skillsForRole } from "@ai/core/skills";
import { getAssistantTool, toOpenAiTools, type AssistantToolContext } from "@ai/core/tools";
import "./tools";
import "../inventory/tools";

const user: SessionUser = {
  id: "priority-user", name: "Rob", email: "test@example.com", role: "adult", locale: "en",
  householdId: "priority-household", householdName: "Test", habitantId: null,
};
const signal = new AbortController().signal;
const ctx: AssistantToolContext = { user, householdId: user.householdId, locale: "en", channel: "chat", signal };
const identity = { user, tokenId: "priority-token", tokenName: "Test", scope: "write" as const };

function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original: unknown = Reflect.get(target, key);
  const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement);
  t.after(() => { Reflect.set(target, key, original); });
  return replacement;
}

function setup(t: TestContext) {
  invalidateEntityCache(user.householdId);
  t.after(() => invalidateEntityCache(user.householdId));
  const product = (id: string, name: string, isEssential: boolean, quantity: number) => ({
    id, name, isEssential, householdId: user.householdId, unit: "pack", category: "PANTRY",
    defaultShopId: null, barcode: null, qrCode: null, imageUrl: null, notes: null,
    packageAmount: null, packageUnit: null, shopLinks: [], alternatives: [], stockProductId: null, stockProduct: null,
    _count: { alternatives: 0 },
    stockItems: [{ placeId: "pantry", quantity: new Prisma.Decimal(quantity), minQuantity: new Prisma.Decimal(2) }],
  });
  const products = [
    product("milk", "Milk", true, 1),
    product("bread", "Bread", true, 2),
    product("chocolate", "Chocolate", false, 1),
    product("coffee", "Coffee", false, 2),
  ];
  const stock = products.map((product) => ({
    ...product.stockItems[0]!, id: `stock-${product.id}`, productId: product.id, householdId: user.householdId,
    unit: "pack", expiresOn: null, updatedAt: new Date(),
    product: { name: product.name, unit: product.unit }, place: { name: "Pantry" },
  }));
  const list = { id: "list", name: "Groceries", householdId: user.householdId, kind: "GROCERIES", defaultSource: "LOW_STOCK", createdAt: new Date(), updatedAt: new Date() };
  const rowOf = (product: typeof products[number], index: number) => ({
    id: `item-${index}`, householdId: user.householdId, productId: product.id, product, name: product.name,
    listId: list.id, list, quantity: new Prisma.Decimal(2), unit: "pack", category: null,
    shopId: null, shop: null, url: null, imageUrl: null, priceCents: null, note: null,
    placeId: "pantry", place: { name: "Pantry" }, source: "LOW_STOCK", taskId: null,
    status: "OPEN", boughtAt: null as Date | null, boughtByUserId: null, createdAt: new Date(),
    project: null, expenseId: null, mealPlanEntryId: null,
  });
  const rows = products.map(rowOf);
  stub(t, db.product, "findFirst", async ({ where }: { where: { id: string } }) => products.find((product) => product.id === where.id) ?? null);
  stub(t, db.product, "count", async ({ where }: { where: { id: string } }) => products.filter((product) => product.id === where.id).length);
  stub(t, db.product, "findMany", async ({ where }: { where: { stockProductId?: string } }) => where.stockProductId ? [] : products);
  const update = stub(t, db.product, "update", async ({ where, data }: { where: { id: string }; data: { isEssential?: boolean } }) => {
    const product = products.find((product) => product.id === where.id);
    assert.ok(product);
    Object.assign(product, data);
    return product;
  });
  stub(t, db.stockItem, "findMany", async ({ where }: { where: { productId?: string } }) => stock.filter((item) => !where.productId || item.productId === where.productId));
  stub(t, db.stockMovement, "findMany", async () => []);
  stub(t, db.shoppingStaple, "findMany", async () => []);
  stub(t, db.shoppingList, "findMany", async () => [list]);
  stub(t, db.shoppingList, "upsert", async () => list);
  stub(t, db.shoppingItem, "groupBy", async () => [{ listId: list.id, _count: { _all: rows.filter((row) => row.status === "OPEN").length } }]);
  stub(t, db.shoppingItem, "findMany", async () => rows);
  stub(t, db.shoppingItem, "count", async ({ where }: { where: { productId: { in: string[] } } }) => rows.filter((row) => where.productId.in.includes(row.productId) && row.status === "OPEN").length);
  stub(t, db.shoppingItem, "create", async ({ data }: { data: { productId: string; quantity?: number } }) => {
    const product = products.find((product) => product.id === data.productId);
    assert.ok(product);
    const row = rowOf(product, rows.length);
    Object.assign(row, data, { quantity: new Prisma.Decimal(data.quantity ?? 2) });
    rows.push(row);
    return row;
  });
  stub(t, db.shop, "findMany", async () => []);
  stub(t, db.auditEntry, "create", async () => ({}));
  return { products, stock, rows, update };
}

async function rpc(method: string, params?: Record<string, unknown>) {
  return handleMcpMessage({ jsonrpc: "2.0", id: 1, method, params }, identity, signal);
}

type Priority = { name?: string; product?: string; stockStatus: string; buyingAdvice?: string | null; essential: boolean; importance: string };
type CallResponse = { result: { isError: boolean; content: { text: string }[]; structuredContent?: unknown } };
async function callMcp(name: string, args: Record<string, unknown> = {}) {
  return await rpc("tools/call", { name, arguments: args }) as CallResponse;
}

function assertAllPriorities(items: Priority[]) {
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((item) => [item.stockStatus, item.buyingAdvice, item.essential, item.importance]), [
    ["below_minimum", "to_buy", true, "essential"],
    ["at_minimum", "warning", true, "essential"],
    ["below_minimum", "to_buy", false, "nice_to_have"],
    ["at_minimum", "warning", false, "nice_to_have"],
  ]);
}

describe("shopping priority over MCP and the assistant", () => {
  it("advertises the essential setting and read filters in both tool schemas", async () => {
    const advertised = await rpc("tools/list") as { result: { tools: { name: string; description: string; inputSchema: { properties: Record<string, { type?: string; enum?: string[] }>; required?: string[] } }[] } };
    const save = advertised.result.tools.find((tool) => tool.name === "inventory_save_product");
    assert.ok(save);
    assert.equal(save.inputSchema.properties.isEssential?.type, "boolean");
    assert.ok(!save.inputSchema.required?.includes("isEssential"));
    assert.equal(save.inputSchema.properties.confirm?.type, "boolean");
    const list = advertised.result.tools.find((tool) => tool.name === "shopping_list");
    assert.ok(list);
    assert.equal(list.inputSchema.properties.isEssential?.type, "boolean");
    assert.deepEqual(list.inputSchema.properties.stockStatus?.enum, ["below_minimum", "at_minimum", "above_minimum"]);
    assert.match(list.description, /at_minimum = warning/);
    const add = advertised.result.tools.find((tool) => tool.name === "shopping_add_item");
    assert.equal(add?.inputSchema.properties.product?.type, "string");
    const assistantSave = getAssistantTool("inventory.save_product");
    assert.ok(assistantSave);
    const [wire] = toOpenAiTools([assistantSave]);
    const schema = wire?.function.parameters as { properties: Record<string, { type?: string }> };
    assert.equal(schema.properties.isEssential?.type, "boolean");
  });

  it("returns all four combinations through actual MCP shopping calls", async (t) => {
    setup(t);
    const response = await callMcp("shopping_list");
    assert.equal(response.result.isError, false);
    const data = response.result.structuredContent as { items: Priority[] };
    assertAllPriorities(data.items);
    assertAllPriorities((JSON.parse(response.result.content[0]!.text) as { items: Priority[] }).items);
  });

  it("passes the same distinctions to the local assistant and keeps false essential values", async (t) => {
    setup(t);
    const list = getAssistantTool("shopping.list");
    assert.ok(list);
    const result = await runTool(list, ctx, {});
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assertAllPriorities((result.data as { items: Priority[] }).items);
    const modelResult = JSON.parse(resultForModel(result)) as { data: { items: Priority[] } };
    assertAllPriorities(modelResult.data.items);
  });

  it("supports questions about nice-to-have warnings without removing other products", async (t) => {
    const { rows } = setup(t);
    const response = await callMcp("shopping_list", { isEssential: false, stockStatus: "at_minimum" });
    assert.equal(response.result.isError, false);
    const data = response.result.structuredContent as { items: Priority[] };
    assert.deepEqual(data.items.map((item) => item.name), ["Coffee"]);
    assert.equal(data.items[0]?.buyingAdvice, "warning");
    assert.equal(data.items[0]?.importance, "nice_to_have");
    assert.equal(rows.length, 4);
    const all = await callMcp("shopping_list");
    assertAllPriorities((all.result.structuredContent as { items: Priority[] }).items);
  });

  it("returns priorities from inventory reads and catalogue queries too", async (t) => {
    setup(t);
    const low = await callMcp("inventory_low_stock");
    assert.equal(low.result.isError, false);
    const lowItems = (low.result.structuredContent as { low: { items: Priority[] } }).low.items;
    assertAllPriorities([...lowItems].sort((a, b) => ["Milk", "Bread", "Chocolate", "Coffee"].indexOf(a.product!) - ["Milk", "Bread", "Chocolate", "Coffee"].indexOf(b.product!)));
    const stock = await callMcp("inventory_stock", { product: "Bread" });
    assert.equal(stock.result.isError, false);
    const data = stock.result.structuredContent as { essential: boolean; stock: Priority[] };
    assert.equal(data.essential, true);
    assert.equal(data.stock[0]?.stockStatus, "at_minimum");
    assert.equal(data.stock[0]?.buyingAdvice, "warning");
    const products = await callMcp("inventory_products");
    assert.equal(products.result.isError, false);
    const catalogue = products.result.structuredContent as { items: { name: string; essential: boolean; importance: string }[] };
    assert.deepEqual(catalogue.items.map((item) => [item.name, item.essential, item.importance]), [
      ["Milk", true, "essential"], ["Bread", true, "essential"], ["Chocolate", false, "nice_to_have"], ["Coffee", false, "nice_to_have"],
    ]);
  });

  it("retrieves all 69 catalogue products through MCP pagination", async (t) => {
    const { products } = setup(t);
    for (let index = 4; index < 69; index++) {
      products.push({ ...products[0]!, id: `product-${index}`, name: `Product ${index}` });
    }
    type Page = { count: number; items: { name: string }[]; more?: number; offset: number; limit: number; hasMore: boolean; nextOffset?: number };
    const pages: Page[] = [];
    let offset = 0;
    do {
      const response = await callMcp("inventory_products", { offset });
      assert.equal(response.result.isError, false);
      const page = response.result.structuredContent as Page;
      assert.equal(page.count, 69);
      assert.equal(page.offset, offset);
      assert.equal(page.limit, 30);
      pages.push(page);
      offset = page.nextOffset ?? 0;
    } while (offset && pages.length < 4);
    assert.deepEqual(pages.map((page) => page.items.length), [30, 30, 9]);
    assert.deepEqual(pages.map((page) => page.more ?? 0), [39, 9, 0]);
    assert.deepEqual(pages.map((page) => page.hasMore), [true, true, false]);
    assert.equal(pages.at(-1)?.nextOffset, undefined);
    assert.deepEqual(pages.flatMap((page) => page.items.map((item) => item.name)), products.map((product) => product.name));
    const all = await callMcp("inventory_products", { limit: 100 });
    assert.equal(all.result.isError, false);
    assert.equal((all.result.structuredContent as Page).items.length, 69);
    assert.equal((all.result.structuredContent as Page).hasMore, false);
    for (const offset of [69, 100]) {
      const end = await callMcp("inventory_products", { offset });
      const page = end.result.structuredContent as Page;
      assert.equal(end.result.isError, false);
      assert.deepEqual(page.items, []);
      assert.equal(page.count, 69);
      assert.equal(page.hasMore, false);
      assert.equal(page.nextOffset, undefined);
    }
  });

  it("paginates filtered products for the local assistant and rejects invalid page arguments", async (t) => {
    const { products } = setup(t);
    stub(t, db.product, "findMany", async ({ where, orderBy }: { where: { householdId: string; name?: { contains: string } }; orderBy: unknown }) => {
      assert.equal(where.householdId, user.householdId);
      assert.deepEqual(orderBy, [{ name: "asc" }, { id: "asc" }]);
      return products.filter((product) => !where.name || product.name.toLowerCase().includes(where.name.contains.toLowerCase()));
    });
    const tool = getAssistantTool("inventory.products");
    assert.ok(tool);
    for (const [offset, name, hasMore] of [[0, "Chocolate", true], [1, "Coffee", false]] as const) {
      const result = await runTool(tool, ctx, { q: "co", offset, limit: 1 });
      assert.ok(result.ok);
      const { data } = JSON.parse(resultForModel(result)) as { data: { count: number; items: { name: string }[]; hasMore: boolean; nextOffset?: number } };
      assert.equal(data.count, 2);
      assert.deepEqual(data.items.map((item) => item.name), [name]);
      assert.equal(data.hasMore, hasMore);
      assert.equal(data.nextOffset, hasMore ? 1 : undefined);
    }
    for (const args of [{ offset: -1 }, { offset: 0.5 }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }]) {
      const response = await callMcp("inventory_products", args);
      assert.equal(response.result.isError, true);
    }
  });

  it("advertises catalogue pagination to MCP clients", async () => {
    const response = await rpc("tools/list") as { result: { tools: { name: string; inputSchema: { properties: Record<string, unknown>; required?: string[] } }[] } };
    const tool = response.result.tools.find((tool) => tool.name === "inventory_products");
    assert.ok(tool?.inputSchema.properties.offset);
    assert.ok(tool.inputSchema.properties.limit);
    assert.ok(!tool.inputSchema.required?.includes("offset"));
    assert.ok(!tool.inputSchema.required?.includes("limit"));
  });

  it("sets essential through confirmed MCP writes, and preserves it on unrelated assistant edits", async (t) => {
    const { products, update } = setup(t);
    const unconfirmed = await callMcp("inventory_save_product", { product: "Milk", isEssential: false });
    assert.equal(unconfirmed.result.isError, true);
    assert.match(unconfirmed.result.content[0]!.text, /nice to have/);
    assert.equal(update.mock.callCount(), 0);
    assert.equal(products[0]?.isEssential, true);
    const confirmed = await callMcp("inventory_save_product", { product: "Milk", isEssential: false, confirm: true });
    assert.equal(confirmed.result.isError, false);
    assert.equal((confirmed.result.structuredContent as { essential: boolean }).essential, false);
    assert.equal((confirmed.result.structuredContent as { importance: string }).importance, "nice_to_have");
    assert.equal(products[0]?.isEssential, false);
    const save = getAssistantTool("inventory.save_product");
    assert.ok(save);
    const changed = await runTool(save, ctx, { product: "Milk", isEssential: true });
    assert.equal(changed.ok, true);
    assert.equal(products[0]?.isEssential, true);
    const kept = await runTool(save, ctx, { product: "Milk", notes: "Keep in the pantry" });
    assert.equal(kept.ok, true);
    assert.equal(products[0]?.isEssential, true);
    const clear = await runTool(save, ctx, { product: "Milk", isEssential: false });
    assert.equal(clear.ok, true);
    assert.equal(products[0]?.isEssential, false);
  });

  it("does not tell the assistant to buy an item already marked bought", async (t) => {
    const { rows } = setup(t);
    rows[0]!.status = "BOUGHT";
    rows[0]!.boughtAt = new Date();
    const response = await callMcp("shopping_list", { bought: true });
    assert.equal(response.result.isError, false);
    const [item] = (response.result.structuredContent as { items: Priority[] }).items;
    assert.equal(item?.stockStatus, "below_minimum");
    assert.equal(item?.buyingAdvice, null);
  });

  it("links products added over MCP so their importance and stock warning stay visible", async (t) => {
    const { rows } = setup(t);
    const added = await callMcp("shopping_add_item", { name: "Bread", product: "Bread", confirm: true });
    assert.equal(added.result.isError, false);
    const result = added.result.structuredContent as Priority;
    assert.equal(result.essential, true);
    assert.equal(result.importance, "essential");
    assert.equal(result.stockStatus, "at_minimum");
    assert.equal(result.buyingAdvice, "warning");
    assert.equal(rows.at(-1)?.productId, "bread");
    assert.equal(rows.at(-1)?.source, "MANUAL");
  });

  it("routes essential-setting questions and documents the buying decision", () => {
    for (const question of ["Mark milk as essential", "Maak melk essentieel", "Milk is a nice to have", "Koffie is een extraatje"]) {
      assert.ok(questionSkillIds(question, skillsForRole("adult")).includes("inventory"), question);
    }
    for (const id of ["shopping", "inventory"]) {
      const guide = getAssistantSkill(id)?.guide ?? "";
      assert.match(guide, /at minimum = warning|at = warning/);
      assert.match(guide, /person (chooses|decides) what to buy/);
    }
  });
});
