import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import type { SessionUser } from "@/features/auth/types/auth";
import type { ShoppingItemSource, ShoppingItemStatus } from "../lib/db";
import { db, Prisma } from "../lib/db";
import { addRecipeItem, createItem, deleteItem, deleteRecipeItems, ensureLowStockItem, getItem, getShoppingOverview, listItems, updateItem } from "./shopping.service";

const user: SessionUser = {
  id: "rob", householdId: "home", name: "Rob", email: "rob@example.com", role: "adult", locale: "nl",
  householdName: "Home", habitantId: null,
};
const decimal = (value: number) => new Prisma.Decimal(value);
const product = {
  id: "leek", householdId: "home", name: "Prei", unit: "stuks", category: "PRODUCE" as const,
  stockProductId: null, defaultShopId: "collect", isEssential: true, barcode: null, qrCode: null, notes: null,
  imageUrl: "https://example.be/prei.jpg", packageAmount: null, packageUnit: null, alternatives: [],
  _count: { alternatives: 0 }, stockProduct: null,
  stockItems: [{ placeId: "kitchen", quantity: decimal(0), minQuantity: decimal(1) }],
  shopLinks: [{ shopId: "collect", url: "https://collect.be/prei", priceCents: 199 }],
};
const shop = { id: "collect", name: "Collect&Go", type: "SUPERMARKET", website: "https://collect.be", logoUrl: null };
const list = (id: string) => ({ id, householdId: "home", name: id === "low" ? "Bijna op" : "Boodschappen", kind: "GROCERIES" as const,
  defaultSource: id === "low" ? "LOW_STOCK" as const : "MANUAL" as const, createdAt: new Date(), updatedAt: new Date() });

function row(id: string, quantity = 1, source: ShoppingItemSource = "MANUAL") {
  const listId = source === "LOW_STOCK" ? "low" : "groceries";
  return {
    id, householdId: "home", productId: "leek" as string | null, product, name: "Prei", quantity: decimal(quantity), unit: "stuks" as string | null,
    listId, list: list(listId), shopId: "collect" as string | null, shop, url: "https://collect.be/prei", imageUrl: product.imageUrl,
    priceCents: 199, note: null as string | null, category: null, placeId: null as string | null, place: null,
    source, taskId: null as string | null, stapleId: null as string | null, projectId: null as string | null,
    project: null, expenseId: null, mealPlanEntryId: null as string | null, status: "OPEN" as ShoppingItemStatus,
    boughtAt: null as Date | null, boughtByUserId: null as string | null, createdByUserId: user.id,
    createdAt: new Date("2026-10-31T10:00:00Z"), updatedAt: new Date(),
  };
}
type Row = ReturnType<typeof row>;

function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original: unknown = Reflect.get(target, key);
  const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement);
  t.after(() => { Reflect.set(target, key, original); });
  return replacement;
}

function setup(t: TestContext, initial: Row[]) {
  const rows = [...initial];
  let shoppingRestockState: "ACTIVE" | "DISMISSED" | "RESTOCKED" = "ACTIVE";
  stub(t, db, "$queryRaw", async () => [{ shoppingRestockState }]);
  const dismiss = stub(t, db.product, "updateMany", async ({ data }: { where: { householdId: string; id: { in: string[] } }; data: { shoppingRestockState: typeof shoppingRestockState } }) => {
    shoppingRestockState = data.shoppingRestockState;
    return { count: 1 };
  });
  function matches(item: Row, where: Prisma.ShoppingItemWhereInput = {}) {
    if (where.householdId && item.householdId !== where.householdId) return false;
    if (typeof where.id === "string" && item.id !== where.id) return false;
    if (typeof where.id === "object" && Array.isArray(where.id.in) && !where.id.in.includes(item.id)) return false;
    if (typeof where.productId === "string" && item.productId !== where.productId) return false;
    if (where.productId === null && item.productId !== null) return false;
    if (where.productId && typeof where.productId === "object" && Array.isArray(where.productId.in) && !where.productId.in.includes(item.productId!)) return false;
    if (typeof where.status === "string" && item.status !== where.status) return false;
    if (where.boughtAt instanceof Date && item.boughtAt?.getTime() !== where.boughtAt.getTime()) return false;
    if (typeof where.mealPlanEntryId === "string" && item.mealPlanEntryId !== where.mealPlanEntryId) return false;
    if (typeof where.stapleId === "string" && item.stapleId !== where.stapleId) return false;
    return true;
  }
  stub(t, db.shoppingItem, "findMany", async ({ where }: { where: Prisma.ShoppingItemWhereInput }) => rows.filter((item) => matches(item, where)));
  stub(t, db.shoppingItem, "findFirst", async ({ where }: { where: Prisma.ShoppingItemWhereInput }) => rows.find((item) => matches(item, where)) ?? null);
  stub(t, db.shoppingItem, "count", async ({ where }: { where: Prisma.ShoppingItemWhereInput }) => rows.filter((item) => matches(item, where)).length);
  stub(t, db.shoppingItem, "create", async ({ data }: { data: Prisma.ShoppingItemUncheckedCreateInput }) => {
    const created = row(`new-${rows.length}`, Number(data.quantity ?? 1), data.source ?? "MANUAL");
    Object.assign(created, data, { quantity: decimal(Number(data.quantity ?? 1)), list: list(data.listId) });
    rows.push(created);
    return created;
  });
  stub(t, db.shoppingItem, "update", async ({ where, data }: { where: { id: string }; data: Prisma.ShoppingItemUncheckedUpdateInput }) => {
    const item = rows.find((item) => item.id === where.id)!;
    const old = item.quantity;
    Object.assign(item, data);
    if (data.quantity !== undefined) {
      const value = data.quantity;
      item.quantity = typeof value === "object" && value !== null && "increment" in value
        ? old.add(Number(value.increment)) : decimal(Number(value));
    }
    if (typeof data.listId === "string") item.list = list(data.listId);
    return item;
  });
  const remove = stub(t, db.shoppingItem, "deleteMany", async ({ where }: { where: Prisma.ShoppingItemWhereInput }) => {
    const deleted = rows.filter((item) => matches(item, where));
    for (const item of deleted) rows.splice(rows.indexOf(item), 1);
    return { count: deleted.length };
  });
  stub(t, db, "$transaction", async (run: (tx: typeof db) => Promise<unknown>) => {
    const before = rows.map((item) => ({ ...item }));
    try { return await run(db); } catch (error) { rows.splice(0, rows.length, ...before); throw error; }
  });
  stub(t, db.product, "findFirst", async () => ({ ...product, shoppingRestockState }));
  stub(t, db.product, "findMany", async () => []);
  stub(t, db.product, "count", async () => 1);
  stub(t, db.shop, "count", async () => 1);
  stub(t, db.shoppingList, "count", async () => 1);
  stub(t, db.shoppingList, "findMany", async () => [list("groceries"), list("low")]);
  stub(t, db.shoppingList, "upsert", async ({ create }: { create: { defaultSource: ShoppingItemSource } }) => list(create.defaultSource === "LOW_STOCK" ? "low" : "groceries"));
  stub(t, db.shoppingStaple, "findMany", async () => []);
  stub(t, db.stockItem, "findMany", async () => []);
  stub(t, db.user, "findMany", async () => []);
  stub(t, db.task, "findMany", async () => []);
  stub(t, db.mealPlanEntry, "findMany", async () => ["meal-a", "meal-b"].map((id) => ({ id, recipe: { id, name: id } })));
  return { rows, remove, dismiss };
}

describe("shopping product positions through the service", () => {
  it("preserves recipe grams during ordinary edits and applies an explicit edit to the number of packages", async (t) => {
    const ingredient = row("grams", 250, "RECIPE");
    Object.assign(ingredient, { unit: "g", mealPlanEntryId: "meal-a", product: { ...product, packageAmount: decimal(500), packageUnit: "g" } });
    setup(t, [ingredient]);
    const before = await getItem("home", ingredient.id);
    assert.equal(before.quantity, 1);
    assert.equal(before.unit, "stuks");
    await updateItem(user, ingredient.id, { quantity: 1, unit: "stuks", note: "Collect&Go" });
    assert.equal(ingredient.quantity.toNumber(), 250);
    assert.equal(ingredient.unit, "g");
    const changed = await updateItem(user, ingredient.id, { quantity: 2 });
    assert.equal(changed.item.quantity, 2);
    assert.equal(ingredient.quantity.toNumber(), 1000);
    assert.equal(ingredient.mealPlanEntryId, "meal-a");
  });

  it("links an original recipe row by id and fills its retailer details without losing grams or the meal", async (t) => {
    const original = row("unlinked-recipe", 250, "RECIPE");
    Object.assign(original, { productId: null, unit: "g", shopId: null, url: null, imageUrl: null, priceCents: null, mealPlanEntryId: "meal-a" });
    const { rows } = setup(t, [original]);
    const result = await updateItem(user, original.id, { productId: "leek" });
    assert.equal(rows.length, 1);
    assert.equal(original.quantity.toNumber(), 250);
    assert.equal(original.unit, "g");
    assert.equal(original.mealPlanEntryId, "meal-a");
    assert.equal(original.shopId, "collect");
    assert.equal(original.url, product.shopLinks[0]?.url);
    assert.equal(original.imageUrl, product.imageUrl);
    assert.equal(original.priceCents, 199);
    assert.equal(result.item.recipe?.entryId, "meal-a");
  });

  it("honours a dismissal committed after the initial product read", async (t) => {
    const { rows } = setup(t, []);
    stub(t, db, "$queryRaw", async () => [{ shoppingRestockState: "DISMISSED" }]);
    assert.equal(await ensureLowStockItem("home", { productId: "leek", placeId: null, quantity: 1, unit: "stuks" }), false);
    assert.equal(rows.length, 0);
  });

  it("dismisses the shared stock owner when an alternative is removed", async (t) => {
    const alternative = row("brand");
    Object.assign(alternative, { product: { ...product, stockProductId: "generic-leek" } });
    const { dismiss } = setup(t, [alternative]);
    await deleteItem(user, "brand");
    assert.deepEqual(dismiss.mock.calls[0]?.arguments[0].where, { householdId: "home", id: { in: ["generic-leek"] } });
  });

  it("persists dismissal when removing an open product and still allows explicit purchases", async (t) => {
    const { dismiss } = setup(t, [row("manual")]);
    await deleteItem(user, "manual");
    assert.equal(dismiss.mock.callCount(), 1);
    assert.equal(await ensureLowStockItem("home", { productId: "leek", placeId: null, quantity: 1, unit: "stuks" }), false);
    const added = await createItem(user, { productId: "leek", quantity: 2, source: "manual" });
    assert.equal(added.quantity, 2);
  });

  it("does not dismiss a product when only deleting bought history", async (t) => {
    const bought = row("history"); bought.status = "BOUGHT"; bought.boughtAt = new Date();
    const { dismiss } = setup(t, [bought]);
    await deleteItem(user, "history");
    assert.equal(dismiss.mock.callCount(), 0);
  });

  it("links a legacy free-text copy only when the complete product name is unique", async (t) => {
    const unlinked = row("old-text", 3); unlinked.productId = null;
    const { rows } = setup(t, [row("low", 1, "LOW_STOCK"), unlinked]);
    stub(t, db.product, "findMany", async () => [product]);
    stub(t, db.shoppingItem, "updateMany", async ({ where, data }: { where: { id: string }; data: { productId: string } }) => {
      const item = rows.find((row) => row.id === where.id)!;
      item.productId = data.productId;
      return { count: 1 };
    });
    const overview = await getShoppingOverview("home");
    assert.equal(overview.items.length, 1);
    assert.equal(overview.items[0]?.quantity, 3);
    assert.equal(unlinked.productId, "leek");
  });

  it("leaves ambiguous product names unlinked rather than guessing a catalogue record", async (t) => {
    const unlinked = row("old-text", 3); unlinked.productId = null;
    setup(t, [unlinked]);
    stub(t, db.product, "findMany", async () => [product, { ...product, id: "other-leek" }]);
    const writes = stub(t, db.shoppingItem, "updateMany", async () => ({ count: 0 }));
    await getShoppingOverview("home");
    assert.equal(writes.mock.callCount(), 0);
    assert.equal(unlinked.productId, null);
  });

  it("repairs existing Prei duplicates in overview, counts, list reads and lookup by either id", async (t) => {
    setup(t, [row("low", 1, "LOW_STOCK"), row("manual", 3)]);
    const overview = await getShoppingOverview("home", "nl");
    assert.equal(overview.items.length, 1);
    assert.equal(overview.items[0]?.quantity, 3);
    assert.equal(overview.items[0]?.priceCents, 199);
    assert.equal(overview.lists.reduce((sum, list) => sum + list.openCount, 0), 1);
    assert.equal((await listItems("home", { listId: "low" }))[0]?.id, "manual");
    assert.equal((await getItem("home", "low")).id, "manual");
    assert.equal((await getItem("home", "manual")).quantity, 3);
  });

  it("manual addition after the low-stock target returns the complete position", async (t) => {
    setup(t, [row("low", 1, "LOW_STOCK")]);
    const item = await createItem(user, { productId: "leek", quantity: 3, source: "manual" });
    assert.equal(item.quantity, 3);
    assert.equal(item.requirements?.length, 2);
    assert.equal((await listItems("home")).length, 1);
  });

  it("keeps independent recipe links and cancellation while exposing one row", async (t) => {
    setup(t, [row("low", 1, "LOW_STOCK")]);
    await addRecipeItem(user, { productId: "leek", name: "Prei", quantity: 3, unit: "stuks", mealPlanEntryId: "meal-a" });
    await addRecipeItem(user, { productId: "leek", name: "Prei", quantity: 2, unit: "stuks", mealPlanEntryId: "meal-b" });
    let items = await listItems("home");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.quantity, 5);
    assert.deepEqual(items[0]?.requirements?.flatMap((part) => part.recipe?.entryId ?? []).sort(), ["meal-a", "meal-b"]);
    await deleteRecipeItems("home", "meal-a");
    items = await listItems("home");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.quantity, 2);
    await deleteRecipeItems("home", "meal-b");
    assert.equal((await listItems("home"))[0]?.quantity, 1);
  });

  it("ticks every reason together, restocks the combined quantity once, and supports undo", async (t) => {
    const { rows } = setup(t, [row("low", 1, "LOW_STOCK"), row("recipe", 3, "RECIPE")]);
    const result = await updateItem(user, "low", { status: "bought" });
    assert.equal(result.item.quantity, 3);
    assert.equal(result.justBought, true);
    assert.ok(rows.every((row) => row.status === "BOUGHT"));
    assert.equal(rows[0]?.boughtAt?.getTime(), rows[1]?.boughtAt?.getTime());
    assert.equal((await listItems("home", { status: "bought" })).length, 1);
    assert.equal((await listItems("home", { status: "open" })).length, 0, "essential/minimum rules cannot resurrect bought goods during this visit");
    await updateItem(user, result.item.id, { status: "open" });
    assert.ok(rows.every((row) => row.status === "OPEN"));
    assert.equal((await listItems("home", { status: "open" })).length, 1);
  });

  it("quantity edits apply to the combined total and retain the original reasons", async (t) => {
    const { rows } = setup(t, [row("low", 1, "LOW_STOCK"), row("recipe", 3, "RECIPE")]);
    const result = await updateItem(user, "recipe", { quantity: 6 });
    assert.equal(result.item.quantity, 6);
    assert.equal(result.item.requirements?.length, 2);
    assert.equal(rows[0]?.quantity.toNumber(), 2);
    assert.equal(rows[1]?.quantity.toNumber(), 6);
  });

  it("removes the whole position by either id and preserves other products and bought history", async (t) => {
    const bought = row("bought"); bought.status = "BOUGHT"; bought.boughtAt = new Date();
    const other = row("other"); other.productId = "potato";
    const { rows } = setup(t, [row("low", 1, "LOW_STOCK"), row("manual", 3), other, bought]);
    await deleteItem(user, "low");
    assert.deepEqual(rows.map((row) => row.id), ["other", "bought"]);
  });

  it("does not allow a child to edit or delete someone else's reason through their own member id", async (t) => {
    const owned = row("owned"); owned.createdByUserId = "child";
    const { rows, remove } = setup(t, [owned, row("adult")]);
    const child = { ...user, id: "child", role: "child" as const };
    await assert.rejects(deleteItem(child, "owned"), /Children can only delete/);
    await assert.rejects(updateItem(child, "owned", { quantity: 2 }), /Children can only edit/);
    assert.equal(remove.mock.callCount(), 0);
    assert.ok(rows.every((row) => row.quantity.toNumber() === 1));
    await updateItem(child, "owned", { status: "bought" });
    assert.ok(rows.every((row) => row.status === "BOUGHT"));
  });

  it("does not resolve or mutate a product position in another household", async (t) => {
    const { rows } = setup(t, [row("manual")]);
    await assert.rejects(deleteItem({ ...user, householdId: "other-home" }, "manual"), /not found/i);
    assert.equal(rows.length, 1);
  });

  it("does not add a second low-stock target after a manual purchase already covers it", async (t) => {
    const { rows } = setup(t, [row("manual", 3)]);
    assert.equal(await ensureLowStockItem("home", { productId: "leek", placeId: "kitchen", quantity: 1, unit: "stuks" }), false);
    assert.equal(rows.length, 1);
  });

  it("shop and list edits affect the whole position instead of splitting it again", async (t) => {
    const { rows } = setup(t, [row("low", 1, "LOW_STOCK"), row("manual", 3)]);
    await updateItem(user, "manual", { listId: "custom", shopId: null });
    assert.ok(rows.every((row) => row.listId === "custom" && row.shopId === null));
    assert.equal((await listItems("home"))[0]?.quantity, 3);
  });
});
