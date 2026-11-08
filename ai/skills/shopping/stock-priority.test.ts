import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import type { SessionUser } from "@/features/auth/types/auth";
import { db, Prisma } from "@/api/lib/db";
import { resultForModel, runTool } from "@ai/core/assistant-loop";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import { getEntityResolver, invalidateEntityCache, registerEntityResolver } from "@ai/core/resolve";
import { questionSkillIds } from "@ai/core/routing";
import { getAssistantSkill, skillsForRole } from "@ai/core/skills";
import { getAssistantTool, toOpenAiTools, type AssistantToolContext } from "@ai/core/tools";
import { rememberOffer } from "../recipes/offers";
import "./tools";
import "../inventory/tools";
import "../recipes/tools";
import "../shops/tools";

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
    id, name, brand: null as string | null, isEssential, householdId: user.householdId, unit: "pack", category: "PANTRY",
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
  stub(t, db, "$queryRaw", async () => [{ shoppingRestockState: "ACTIVE" }]);
  stub(t, db.product, "updateMany", async () => ({ count: 1 }));
  stub(t, db.product, "findFirst", async ({ where }: { where: { id: string } }) => products.find((product) => product.id === where.id) ?? null);
  stub(t, db.product, "count", async ({ where }: { where: { id: string } }) => products.filter((product) => product.id === where.id).length);
  stub(t, db.product, "findMany", async ({ where }: { where: { stockProductId?: string } }) => where.stockProductId ? [] : products);
  const update = stub(t, db.product, "update", async ({ where, data }: { where: { id: string }; data: { isEssential?: boolean; packageAmount?: number | null } }) => {
    const product = products.find((product) => product.id === where.id);
    assert.ok(product);
    Object.assign(product, data);
    if (typeof data.packageAmount === "number") Object.assign(product, { packageAmount: new Prisma.Decimal(data.packageAmount) });
    return product;
  });
  stub(t, db.stockItem, "findMany", async ({ where }: { where: { productId?: string } }) => stock.filter((item) => !where.productId || item.productId === where.productId));
  stub(t, db.stockMovement, "findMany", async () => []);
  stub(t, db.shoppingStaple, "findMany", async () => []);
  stub(t, db.shoppingList, "findMany", async () => [list]);
  stub(t, db.shoppingList, "upsert", async () => list);
  stub(t, db.shoppingItem, "groupBy", async () => [{ listId: list.id, _count: { _all: rows.filter((row) => row.status === "OPEN").length } }]);
  stub(t, db, "$transaction", async (run: (tx: typeof db) => Promise<unknown>) => run(db));
  stub(t, db.shoppingItem, "findMany", async ({ where }: { where: { productId?: string; status?: string; boughtAt?: Date } }) => rows.filter((row) =>
    (!where.productId || row.productId === where.productId) && (!where.status || row.status === where.status)
    && (!where.boughtAt || row.boughtAt?.getTime() === where.boughtAt.getTime())));
  stub(t, db.shoppingItem, "findFirst", async ({ where }: { where: { id?: string; productId?: { in: string[] } } }) =>
    rows.find((row) => where.id ? row.id === where.id : where.productId?.in.includes(row.productId)) ?? null);
  stub(t, db.shoppingItem, "update", async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.find((row) => row.id === where.id)!;
    Object.assign(row, data);
    if (typeof data.quantity === "number") row.quantity = new Prisma.Decimal(data.quantity);
    return row;
  });
  stub(t, db.shoppingItem, "deleteMany", async ({ where }: { where: { id: { in: string[] } } }) => {
    const deleted = rows.filter((row) => where.id.in.includes(row.id));
    for (const row of deleted) rows.splice(rows.indexOf(row), 1);
    return { count: deleted.length };
  });
  stub(t, db.shoppingItem, "count", async ({ where }: { where: { productId: { in: string[] } | null; name?: { equals: string } } }) =>
    rows.filter((row) => (where.productId ? where.productId.in.includes(row.productId) : row.name === where.name?.equals) && row.status === "OPEN").length);
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

function setupRecipe(t: TestContext) {
  const state = setup(t);
  const ingredient = (index: number, quantity: number, unit = "pack") => ({
    id: `ingredient-${index}`, position: index, name: state.products[index]!.name,
    productId: state.products[index]!.id, product: state.products[index]!,
    quantity: new Prisma.Decimal(quantity), unit, optional: false, note: null,
  });
  Object.assign(state.products[0]!, { packageAmount: new Prisma.Decimal(250), packageUnit: "ml" });
  const recipe = {
    id: "recipe", name: "Test meal", servings: 2, category: null, sourceUrl: null,
    imageUrl: null, coverFileId: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
    ingredients: [ingredient(0, 300, "ml"), ingredient(2, 0.25), ingredient(3, 4)], steps: [], _count: { steps: 0 },
  };
  stub(t, db.recipe, "findMany", async () => [recipe]);
  stub(t, db.recipe, "findFirst", async () => recipe);
  const entry = {
    id: "meal", recipeId: recipe.id, recipe: { ...recipe }, servings: 4, status: "TO_COOK",
    currentStep: 0, addedByUserId: null, createdAt: new Date(), startedAt: null, cookedAt: null,
  };
  const plan = stub(t, db.mealPlanEntry, "create", async () => entry);
  stub(t, db.mealPlanEntry, "findFirst", async () => entry);
  stub(t, db.mealPlanEntry, "findMany", async () => [{ id: entry.id, recipe: { id: recipe.id, name: recipe.name } }]);
  stub(t, db.shoppingItem, "findFirst", async ({ where }: { where: { productId?: { in: string[] } } }) =>
    state.rows.find((row) => where.productId?.in.includes(row.productId)) ?? null);
  return { ...state, recipe, plan };
}

async function rpc(method: string, params?: Record<string, unknown>) {
  return handleMcpMessage({ jsonrpc: "2.0", id: 1, method, params }, identity, signal);
}

type Priority = { name?: string; product?: string; stockStatus: string; stockNeed?: string | null; buyingAdvice?: string | null; essential: boolean; importance: string };
type CallResponse = { result: { isError: boolean; content: { text: string }[]; structuredContent?: unknown } };
async function callMcp(name: string, args: Record<string, unknown> = {}) {
  return await rpc("tools/call", { name, arguments: args }) as CallResponse;
}

function assertAllPriorities(items: Priority[]) {
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((item) => [item.stockStatus, item.stockNeed, item.buyingAdvice, item.essential, item.importance]), [
    ["below_minimum", "out", "to_buy", true, "essential"],
    ["at_minimum", "out", "to_buy", true, "essential"],
    ["below_minimum", "out", "to_buy", false, "nice_to_have"],
    ["at_minimum", "nearly_out", "warning", false, "nice_to_have"],
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
    assert.match(list.description, /essential at minimum/);
    assert.deepEqual(list.inputSchema.properties.stockNeed?.enum, ["out", "nearly_out"]);
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

  it("combines groceries for a saved shop group or an ad-hoc trip without counting a row twice", async (t) => {
    const { rows } = setup(t);
    const shops = ["Colruyt", "Collect&Go", "OKay", "Gamma"].map((name, index) => ({ id: `shop-${index}`, name }));
    const original = getEntityResolver("shop")!;
    registerEntityResolver({ type: "shop", label: "shop", skill: "shops", list: async () => shops });
    t.after(() => registerEntityResolver(original));
    rows.forEach((row, index) => Object.assign(row, { shopId: shops[index]!.id, shop: { ...shops[index]!, type: "SUPERMARKET", iconUrl: null } }));
    stub(t, db.shopGroup, "findMany", async ({ where }: { where: { householdId: string } }) => {
      assert.equal(where.householdId, user.householdId);
      return [{ id: "colruyt-group", name: "Colruyt-groep", members: shops.slice(0, 3).map((shop) => ({ shopId: shop.id })) }];
    });
    const group = await callMcp("shopping_list", { shopGroup: "Colruyt-groep" });
    assert.equal(group.result.isError, false, group.result.content[0]!.text);
    assert.deepEqual((group.result.structuredContent as { items: { name: string }[] }).items.map((item) => item.name), ["Milk", "Bread", "Chocolate"]);
    const trip = await callMcp("shopping_list", { shops: ["Colruyt", "Collect&Go", "Colruyt"] });
    assert.equal(trip.result.isError, false, trip.result.content[0]!.text);
    assert.deepEqual((trip.result.structuredContent as { items: { name: string }[] }).items.map((item) => item.name), ["Milk", "Bread"]);
  });

  it("includes automatic replenishments when MCP asks for the default groceries view", async (t) => {
    const { rows } = setup(t);
    const automatic = rows[0]!.list;
    const groceries = { ...automatic, id: "manual-list", name: "Everyday", defaultSource: "MANUAL" };
    stub(t, db.shoppingList, "findMany", async () => [automatic, groceries]);
    Object.assign(rows[0]!, { listId: groceries.id, list: groceries });
    const all = await callMcp("shopping_list", { list: groceries.id });
    assert.equal(all.result.isError, false, all.result.content[0]!.text);
    assert.equal((all.result.structuredContent as { items: unknown[] }).items.length, 4);
    const warnings = await callMcp("shopping_list", { list: groceries.id, stockStatus: "at_minimum" });
    assert.equal(warnings.result.isError, false);
    assert.deepEqual((warnings.result.structuredContent as { items: { name: string }[] }).items.map((item) => item.name), ["Bread", "Coffee"]);
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
    assert.equal(data.stock[0]?.buyingAdvice, "to_buy");
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
    type SearchTerm = { name?: { contains: string }; brand?: { contains: string } };
    stub(t, db.product, "findMany", async ({ where, orderBy }: {
      where: { householdId: string; name?: { contains: string }; AND?: { OR: SearchTerm[] }[] };
      orderBy: unknown;
    }) => {
      assert.equal(where.householdId, user.householdId);
      assert.deepEqual(orderBy, [{ name: "asc" }, { id: "asc" }]);
      // Mirror Prisma's new name-or-brand search, including the AND wrapper used to preserve barcode filters.
      const terms: SearchTerm[] = where.AND?.flatMap((group) => group.OR) ?? (where.name ? [{ name: where.name }] : []);
      return products.filter((product) => !terms.length || terms.some((term) =>
        (term.name && product.name.toLowerCase().includes(term.name.contains.toLowerCase())) ||
        (term.brand && product.brand?.toLowerCase().includes(term.brand.contains.toLowerCase())),
      ));
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
    products[0]!.brand = "Cooperative";
    const byBrand = await runTool(tool, ctx, { q: "cooperative", offset: 0, limit: 5 });
    assert.ok(byBrand.ok);
    const brandPage = JSON.parse(resultForModel(byBrand)) as { data: { count: number; items: { name: string }[] } };
    assert.equal(brandPage.data.count, 1);
    assert.deepEqual(brandPage.data.items.map((item) => item.name), ["Milk"]);

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

  it("saves explicit product brands through MCP, preserves them on unrelated edits and clears only explicitly", async (t) => {
    const { products } = setup(t);
    const added = await callMcp("inventory_save_product", { product: "Milk", brand: "Boni", confirm: true });
    assert.equal(added.result.isError, false, added.result.content[0]?.text);
    assert.equal(products[0]?.brand, "Boni");
    const detail = await callMcp("inventory_products", { product: "Milk" });
    assert.equal((detail.result.structuredContent as { brand: string }).brand, "Boni");
    const unrelated = await callMcp("inventory_save_product", { product: "Milk", notes: "Keep cool", confirm: true });
    assert.equal(unrelated.result.isError, false);
    assert.equal(products[0]?.brand, "Boni");
    const cleared = await callMcp("inventory_save_product", { product: "Milk", brand: null, confirm: true });
    assert.equal(cleared.result.isError, false);
    assert.equal(products[0]?.brand, null);
  });

  it("stores a directly supplied product photo, keeps it on later edits and removes it only explicitly", async (t) => {
    const { products } = setup(t);
    const photo = "https://market.example/milk.jpg";
    const save = await callMcp("inventory_save_product", { product: "Milk", imageUrl: photo, confirm: true });
    assert.equal(save.result.isError, false, save.result.content[0]!.text);
    assert.equal(products[0]!.imageUrl, photo);
    const receipt = save.result.structuredContent as { verification: string; setup: { present: { photo: boolean }; missing: string[] } };
    assert.equal(receipt.verification, "stored_fields_checked");
    assert.equal(receipt.setup.present.photo, true);
    assert.ok(receipt.setup.missing.includes("productLink"), "does not claim the whole setup is complete");
    await callMcp("inventory_save_product", { product: "Milk", notes: "Updated note", confirm: true });
    assert.equal(products[0]!.imageUrl, photo);
    const detail = await callMcp("inventory_products", { product: "Milk" });
    assert.equal((detail.result.structuredContent as { imageUrl: string }).imageUrl, photo);
    await callMcp("inventory_save_product", { product: "Milk", imageUrl: null, confirm: true });
    assert.equal(products[0]!.imageUrl, null);
    const invalid = await callMcp("inventory_save_product", { product: "Milk", imageUrl: "javascript:alert(1)", confirm: true });
    assert.equal(invalid.result.isError, true);
  });

  it("copies a verified offer's photo, retailer, link, price, package and barcode into the stored product", async (t) => {
    const { products } = setup(t);
    stub(t, db.shop, "count", async () => 1);
    stub(t, db.productShopLink, "upsert", async ({ create }: { create: { productId: string; shopId: string; url: string; priceCents: number } }) => {
      const link = { ...create, id: "link", articleNumber: null, shop: { id: "market", name: "Market", type: "SUPERMARKET", icon: null } };
      Object.assign(products[0]!, { shopLinks: [link] });
      return link;
    });
    const offer = rememberOffer(user.householdId, { name: "Milk 500 ml", shopId: "market", shopName: "Market", url: "https://market.example/milk", imageUrl: "https://market.example/milk.jpg", priceCents: 199, packageAmount: 500, packageUnit: "ml", barcode: "5400000000017" });
    const saved = await callMcp("inventory_save_product", { product: "Milk", offer, confirm: true });
    assert.equal(saved.result.isError, false, saved.result.content[0]!.text);
    const receipt = saved.result.structuredContent as { imageUrl: string; defaultShopId: string; setup: { missing: string[] }; links: { shop: string; url: string; price: string }[] };
    assert.equal(receipt.imageUrl, "https://market.example/milk.jpg");
    assert.equal(receipt.defaultShopId, "market");
    assert.deepEqual(receipt.setup.missing, ["brand"], "an offer with no verified brand must not be marked complete");
    assert.equal(receipt.links[0]?.url, "https://market.example/milk");
    assert.equal(receipt.links[0]?.price, "€ 1,99");
    assert.equal(products[0]!.barcode, "5400000000017");
  });

  it("rejects exact catalogue duplicates and incomplete link arguments before any write", async (t) => {
    const { update } = setup(t);
    const create = stub(t, db.product, "create", async () => { throw new Error("should not create"); });
    const duplicate = await callMcp("inventory_save_product", { name: "milk", confirm: true });
    assert.equal(duplicate.result.isError, true);
    assert.match(duplicate.result.content[0]!.text, /already exists.*Reuse/);
    const incomplete = await callMcp("inventory_save_product", { name: "New product", linkUrl: "https://market.example/new", confirm: true });
    assert.equal(incomplete.result.isError, true);
    assert.match(incomplete.result.content[0]!.text, /linkShop/);
    assert.equal(create.mock.callCount(), 0);
    assert.equal(update.mock.callCount(), 0);
  });

  it("allows an offline product and reports its missing data instead of inventing completeness", async (t) => {
    const { products } = setup(t);
    stub(t, db.product, "create", async ({ data }: { data: Record<string, unknown> }) => {
      const row = { ...products[0]!, id: "offline", name: "Handmade sponge", stockItems: [] };
      Object.assign(row, data);
      products.push(row);
      return row;
    });
    const response = await callMcp("inventory_save_product", { name: "Handmade sponge", confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    const receipt = response.result.structuredContent as { setup: { missing: string[] } };
    for (const field of ["photo", "shop", "productLink", "stockUnit", "barcode"]) assert.ok(receipt.setup.missing.includes(field), field);
  });

  it("discloses a failed final read-back without telling the assistant to create the product again", async (t) => {
    const { products } = setup(t);
    let wrote = false;
    stub(t, db.product, "findFirst", async () => {
      if (wrote) throw new Error("read-back unavailable");
      return products[0];
    });
    stub(t, db.product, "update", async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(products[0]!, data); wrote = true; return products[0];
    });
    const response = await callMcp("inventory_save_product", { product: "milk", notes: "Updated", confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    assert.equal((response.result.structuredContent as { verification: string }).verification, "pending");
    assert.match(response.result.content[0]!.text, /Do not create it again/);
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
    assert.equal(result.buyingAdvice, "to_buy");
    assert.equal(rows.at(-1)?.productId, "bread");
    assert.equal(rows.at(-1)?.source, "MANUAL");
  });

  it("refuses unlinked MCP additions when a catalogue product may match, even with an exception", async (t) => {
    const { rows } = setup(t);
    for (const args of [{ name: "Milk" }, { name: "Milk", unlinkedReason: "Just a one-off" }, { name: "Chocolat" }]) {
      const response = await callMcp("shopping_add_item", { ...args, confirm: true });
      assert.equal(response.result.isError, true);
      assert.match(response.result.content[0]!.text, /Possible catalogue products/);
      assert.match(response.result.content[0]!.text, /inventory_stock/);
    }
    assert.equal(rows.length, 4, "no unlinked duplicate was created");
  });

  it("requires a deliberate exception for unknown products in MCP and built-in chat", async (t) => {
    const { rows } = setup(t);
    const response = await callMcp("shopping_add_item", { name: "Birthday candles", confirm: true });
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0]!.text, /inventory_save_product/);
    assert.match(response.result.content[0]!.text, /unlinkedReason/);
    const tool = getAssistantTool("shopping.add_item")!;
    const result = await runTool(tool, ctx, { name: "Birthday candles" });
    assert.equal(result.ok, false);
    await assert.rejects(() => Promise.resolve(tool.preview!(ctx, { name: "Birthday candles" })), /unlinkedReason/);
    assert.equal(rows.length, 4);
  });

  it("exposes package sizes and stock-sharing alternatives in catalogue reads", async (t) => {
    const { products } = setup(t);
    Object.assign(products[0]!, {
      packageAmount: new Prisma.Decimal(250), packageUnit: "ml", stockProductId: "generic-milk",
      shopLinks: [{ id: "link", shopId: "shop", shop: { id: "shop", name: "Market", type: "SUPERMARKET", iconUrl: null }, url: "https://example.com/milk", priceCents: 150, articleNumber: null }],
    });
    const response = await callMcp("inventory_products", { product: "Milk" });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    const detail = response.result.structuredContent as { id: string; sharesStockWith: string; packageAmount: number; packageUnit: string; links: { url: string }[] };
    assert.equal(detail.id, "milk");
    assert.equal(detail.sharesStockWith, "generic-milk");
    assert.equal(detail.packageAmount, 250);
    assert.equal(detail.packageUnit, "ml");
    assert.equal(detail.links[0]?.url, "https://example.com/milk");
  });

  it("repairs an existing unlinked grocery item without adding another item", async (t) => {
    const { rows, products } = setup(t);
    const unlinked = { ...rows[0]!, id: "unlinked", name: "Party milk" };
    Object.assign(unlinked, { productId: null, product: null });
    rows.push(unlinked);
    stub(t, db.shoppingItem, "findFirst", async () => unlinked);
    stub(t, db.shoppingItem, "update", async ({ data }: { data: { productId: string } }) => {
      Object.assign(unlinked, data, { product: products.find((product) => product.id === data.productId) });
      return unlinked;
    });
    const before = await callMcp("shopping_list");
    const entry = (before.result.structuredContent as { items: { id: string; linkedToProduct: boolean }[] }).items.find((item) => item.id === "unlinked");
    assert.equal(entry?.linkedToProduct, false);
    const response = await callMcp("shopping_update_item", { item: "unlinked", product: "Milk", confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    assert.equal(unlinked.productId, "milk");
    assert.equal(rows.length, 5);
  });

  it("repairs a bought recipe row by its listed id even when an open product has the same name", async (t) => {
    const { rows } = setup(t);
    const original = { ...rows[0]!, id: "bought-recipe", status: "BOUGHT", boughtAt: new Date() };
    Object.assign(original, { productId: null, product: null, source: "RECIPE", mealPlanEntryId: "meal", quantity: new Prisma.Decimal(3) });
    rows.push(original);
    stub(t, db.mealPlanEntry, "findMany", async () => [{ id: "meal", recipe: { id: "recipe", name: "Soup" } }]);
    const listed = await callMcp("shopping_list", { bought: true, q: "Milk" });
    assert.equal(listed.result.isError, false);
    assert.ok((listed.result.structuredContent as { items: { id: string }[] }).items.some((row) => row.id === original.id));
    const response = await callMcp("shopping_update_item", { item: original.id, product: "Milk", confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    assert.equal(original.productId, "milk");
    assert.equal(original.status, "BOUGHT");
    assert.equal(original.quantity.toNumber(), 3);
    assert.equal((response.result.structuredContent as { id: string }).id, original.id);
  });

  it("keeps identically named distinct products distinguishable by id over MCP", async (t) => {
    const { rows } = setup(t);
    rows.push({ ...rows[0]!, id: "duplicate-milk", productId: "different-milk" });
    stub(t, db.shoppingItem, "findFirst", async ({ where }: { where: { id: string; householdId: string } }) => {
      assert.equal(where.householdId, user.householdId);
      return rows.find((row) => row.id === where.id) ?? null;
    });
    const remove = stub(t, db.shoppingItem, "deleteMany", async ({ where }: { where: { id: { in: string[] } } }) => {
      const deleted = rows.filter((row) => where.id.in.includes(row.id));
      for (const row of deleted) rows.splice(rows.indexOf(row), 1);
      return { count: deleted.length };
    });
    const ambiguous = await callMcp("shopping_remove", { item: "Milk", confirm: true });
    assert.equal(ambiguous.result.isError, true);
    assert.match(ambiguous.result.content[0]!.text, /id: item-0/);
    assert.match(ambiguous.result.content[0]!.text, /id: duplicate-milk/);
    assert.equal(remove.mock.callCount(), 0);

    const listed = await callMcp("shopping_list", { q: "milk" });
    const copies = (listed.result.structuredContent as { items: { id: string; name: string }[] }).items;
    assert.deepEqual(copies.map((item) => item.id), ["item-0", "duplicate-milk"]);
    const response = await callMcp("shopping_remove", { item: copies[1]!.id, confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    assert.equal(remove.mock.callCount(), 1);
    assert.deepEqual(rows.filter((row) => row.name === "Milk").map((row) => row.id), ["item-0"]);
    const after = await callMcp("shopping_list", { q: "milk" });
    assert.equal((after.result.structuredContent as { items: unknown[] }).items.length, 1);
  });

  it("allows an explained one-off after checking the household catalogue", async (t) => {
    const { rows } = setup(t);
    const create = stub(t, db.shoppingItem, "create", async ({ data }: { data: Record<string, unknown> }) => ({
      ...rows[0]!, ...data, id: "candles", product: null, quantity: new Prisma.Decimal(1),
    }));
    const response = await callMcp("shopping_add_item", {
      name: "Birthday candles", unlinkedReason: "One-off party supply, no catalogue product needed", confirm: true,
    });
    assert.equal(response.result.isError, false);
    assert.equal(create.mock.callCount(), 1);
    assert.equal(create.mock.calls[0]!.arguments[0].data.productId, null);
    assert.match((response.result.structuredContent as { unlinkedReason: string }).unlinkedReason, /One-off/);
  });

  it("plans linked groceries by default using servings, package size, supply and existing list items", async (t) => {
    const { rows, plan } = setupRecipe(t);
    rows.splice(0, 1); // Milk needs buying; chocolate is sufficient, coffee is already on the list.
    const before = rows.length;
    const response = await callMcp("recipes_plan", { recipe: "Test meal", servings: 4, confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    assert.equal(plan.mock.callCount(), 1);
    assert.equal(rows.length, before + 1);
    const added = rows.at(-1)!;
    assert.equal(added.productId, "milk");
    assert.equal(added.quantity.toNumber(), 2, "600 ml needed minus 250 ml stock = two 250 ml packs");
    assert.equal(added.source, "RECIPE");
  });

  it("MCP recipe saves automatically link existing ingredients and disclose unknown ones", async (t) => {
    const { products } = setup(t);
    stub(t, db.product, "count", async () => 1);
    type Ingredient = { productId: string | null; name: string; quantity: number | null; unit: string | null; note: string | null; optional: boolean };
    const save = stub(t, db.recipe, "create", async ({ data }: { data: { name: string; ingredients: { create: Ingredient[] } } }) => ({
      id: "saved", name: data.name, category: null, servings: 2, sourceUrl: null, imageUrl: null, coverFileId: null, notes: null,
      ingredients: data.ingredients.create.map((item, position) => ({ ...item, id: `ingredient-${position}`, position,
        quantity: item.quantity === null ? null : new Prisma.Decimal(item.quantity), product: products.find((product) => product.id === item.productId) ?? null,
      })), steps: [], createdAt: new Date(), updatedAt: new Date(),
    }));
    const response = await callMcp("recipes_save", { name: "Soup", ingredients: [
      { name: "Milk", quantity: 300, unit: "ml", note: "cold" }, { name: "Tap water", quantity: 200, unit: "ml" },
    ], confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    const ingredients = save.mock.calls[0]!.arguments[0].data.ingredients.create;
    assert.equal(ingredients[0]?.productId, "milk");
    assert.equal(ingredients[0]?.quantity, 300);
    assert.equal(ingredients[0]?.unit, "ml");
    const report = response.result.structuredContent as { linkedIngredients: number; unlinkedIngredients: { name: string }[] };
    assert.equal(report.linkedIngredients, 1);
    assert.deepEqual(report.unlinkedIngredients.map((item) => item.name), ["Tap water"]);
  });

  it("MCP recipe save rejects ambiguous catalogue products before writing a recipe", async (t) => {
    const { products } = setup(t);
    products.push({ ...products[0]!, id: "second-milk" });
    const save = stub(t, db.recipe, "create", async () => ({}));
    const response = await callMcp("recipes_save", { name: "Soup", ingredients: [{ name: "Milk", quantity: 300, unit: "ml" }], confirm: true });
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0]!.text, /Choose an existing product.*second-milk/);
    assert.equal(save.mock.callCount(), 0);
  });

  it("MCP bulk import links new ingredients to catalogue products before its transaction writes", async (t) => {
    setup(t);
    stub(t, db.recipe, "findMany", async () => []);
    stub(t, db.product, "count", async () => 1);
    const save = stub(t, db.recipe, "create", async ({ data }: { data: { name: string; sourceUrl: string; ingredients: { create: { productId: string | null; quantity: number; unit: string }[] } } }) => ({ id: "imported", name: data.name, sourceUrl: data.sourceUrl, categoryId: null }));
    const response = await callMcp("recipes_import_batch", { recipes: [{ sourceUrl: "https://example.com/soup", name: "Soup", ingredients: [{ name: "Milk", quantity: 300, unit: "ml" }] }], confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    assert.equal(save.mock.calls[0]?.arguments[0].data.ingredients.create[0]?.productId, "milk");
    assert.equal(save.mock.calls[0]?.arguments[0].data.ingredients.create[0]?.quantity, 300);
    assert.equal((response.result.structuredContent as { created: number }).created, 1);
  });

  it("MCP cooking extras also require a product choice when the ingredient is ambiguous", async (t) => {
    const { products } = setup(t);
    products.push({ ...products[0]!, id: "second-milk" });
    const extra = stub(t, db.cookExtraIngredient, "create", async () => ({}));
    const response = await callMcp("recipes_add_ingredient", { name: "Milk", quantity: 300, unit: "ml", use: false, saveToRecipe: true, confirm: true });
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0]!.text, /Choose an existing product/);
    assert.equal(extra.mock.callCount(), 0);
  });

  it("refuses to plan unlinked required groceries before creating a meal or shopping item", async (t) => {
    const { recipe, rows, plan } = setupRecipe(t);
    Object.assign(recipe.ingredients[0]!, { productId: null, product: null });
    const response = await callMcp("recipes_plan", { recipe: "Test meal", confirm: true });
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0]!.text, /recipes_match.*inventory_save_product.*recipes_save/);
    assert.equal(plan.mock.callCount(), 0);
    assert.equal(rows.length, 4);
  });

  it("supports explicitly planning without groceries even when ingredients are unlinked", async (t) => {
    const { recipe, rows, plan } = setupRecipe(t);
    Object.assign(recipe.ingredients[0]!, { productId: null, product: null });
    const response = await callMcp("recipes_plan", { recipe: "Test meal", buy: "none", confirm: true });
    assert.equal(response.result.isError, false, response.result.content[0]!.text);
    assert.equal(plan.mock.callCount(), 1);
    assert.equal(rows.length, 4);
    assert.doesNotMatch(response.result.content[0]!.text, /Nothing needed buying/);
  });

  it("routes essential-setting questions and documents the buying decision", () => {
    for (const question of ["Mark milk as essential", "Maak melk essentieel", "Milk is a nice to have", "Koffie is een extraatje"]) {
      assert.ok(questionSkillIds(question, skillsForRole("adult")).includes("inventory"), question);
    }
    for (const id of ["shopping", "inventory"]) {
      const guide = getAssistantSkill(id)?.guide ?? "";
      assert.match(guide, /essential at minimum = out/);
      assert.match(guide, /nonessential at minimum = (nearly_out|out.*nearly_out)/);
      assert.match(guide, /person (chooses|decides) what to buy/);
    }
  });
});

it("MCP shopping ticks automatically restock verified goods once, including legacy addToStock and re-ticks", async (t) => {
  const { stock } = setup(t);
  const purchases: { id: string; shoppingItemId: string; quantity: Prisma.Decimal }[] = [];
  const evidence = new Map<string, { stockItemId: string; quantity: Prisma.Decimal; purchaseIds: string[] }>();
  const item = stock[0]!;
  stub(t, db.user, "findMany", async () => [{ id: user.id, email: user.email, habitant: null }]);
  stub(t, db.stockItem, "findFirst", async () => item);
  stub(t, db.stockItem, "findFirstOrThrow", async () => item);
  stub(t, db.stockItem, "update", async ({ data }: { data: { quantity: number } }) => { item.quantity = new Prisma.Decimal(data.quantity); return item; });
  stub(t, db.stockPurchase, "findMany", async ({ where }: { where: { shoppingItemId?: { in: string[] } } }) => where.shoppingItemId ? purchases.filter((purchase) => where.shoppingItemId!.in.includes(purchase.shoppingItemId)) : purchases);
  stub(t, db.stockPurchase, "create", async ({ data }: { data: { shoppingItemId: string; quantity: number } }) => { const purchase = { ...data, id: "purchase-1", quantity: new Prisma.Decimal(data.quantity) }; purchases.push(purchase); return purchase; });
  stub(t, db.stockPurchaseEvidence, "findUnique", async ({ where }: { where: { householdId_sourceKey: { sourceKey: string } } }) => evidence.get(where.householdId_sourceKey.sourceKey) ?? null);
  stub(t, db.stockPurchaseEvidence, "create", async ({ data }: { data: { sourceKey: string; stockItemId: string; quantity: number; purchaseIds: string[] } }) => { const entry = { ...data, quantity: new Prisma.Decimal(data.quantity) }; evidence.set(data.sourceKey, entry); return entry; });
  const movements = stub(t, db.stockMovement, "create", async () => ({ id: "movement" }));
  const bought = await callMcp("shopping_update_item", { item: "item-0", bought: true, confirm: true });
  assert.equal(bought.result.isError, false, bought.result.content[0]?.text);
  assert.equal((bought.result.structuredContent as { purchase: { added: number } }).purchase.added, 2);
  assert.equal(item.quantity.toNumber(), 3);
  for (const args of [{ bought: true, addToStock: true }, { bought: false }, { bought: true }]) {
    const result = await callMcp("shopping_update_item", { item: "item-0", ...args, confirm: true });
    assert.equal(result.result.isError, false, result.result.content[0]?.text);
  }
  assert.equal(item.quantity.toNumber(), 3); assert.equal(movements.mock.callCount(), 1); assert.equal(purchases.length, 1);
});

it("MCP filters forecasts separately from raw stock comparisons", async (t) => {
  setup(t);
  const out = await callMcp("shopping_list", { stockNeed: "out" });
  assert.equal(out.result.isError, false);
  const data = out.result.structuredContent as { items: Priority[] };
  assert.deepEqual(data.items.map((item) => item.name), ["Milk", "Bread", "Chocolate"]);
  assert.ok(data.items.every((item) => item.stockNeed === "out" && item.buyingAdvice === "to_buy"));
  const near = await callMcp("shopping_list", { stockNeed: "nearly_out" });
  assert.equal(near.result.isError, false);
  assert.deepEqual((near.result.structuredContent as { items: Priority[] }).items.map((item) => item.name), ["Coffee"]);
});
