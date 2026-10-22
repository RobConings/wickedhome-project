import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { isBelowMinimum } from "@/features/inventory/types/inventory";
import { db, Prisma } from "../lib/db";
import { createProduct, getShoppingOverview, listItems, updateProduct } from "../shopping/shopping.service";
import { addMovement, createStockItem, updateStockItem } from "./inventory.service";

const actor = { id: "user", householdId: "household", locale: "nl" as const };
const decimal = (amount: number) => new Prisma.Decimal(amount);

// Prisma's proxy descriptors hide methods from mock.method; assign tracked mocks and restore them.
function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original: unknown = Reflect.get(target, key);
  const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement);
  t.after(() => { Reflect.set(target, key, original); });
  return replacement;
}

function setup(t: TestContext, quantity = 1, minimum: number | null = 2) {
  let stock = {
    id: "stock", householdId: actor.householdId, productId: "milk", placeId: "fridge",
    quantity: decimal(quantity), minQuantity: minimum === null ? null : decimal(minimum),
    unit: null as string | null, expiresOn: null, updatedAt: new Date(),
    product: { name: "Milk", unit: "pack" }, place: { name: "Fridge" },
  };
  const items: { productId: string | null; status: string; quantity?: number; unit?: string; source?: string }[] = [];
  const movements: unknown[] = [];
  const product = {
    id: "milk", name: "Milk", stockProductId: null, unit: "pack", defaultShopId: null, shopLinks: [], imageUrl: null,
    category: "DAIRY", isEssential: false, alternatives: [], notes: null, barcode: null, qrCode: null,
    packageAmount: null, packageUnit: null,
  };
  stub(t, db.product, "findFirst", async () => product);
  stub(t, db.product, "findMany", async () => [{ id: "other-brand", name: "Other milk", stockProductId: "milk", shopLinks: [] }]);
  stub(t, db.product, "create", async ({ data }: { data: { isEssential?: boolean } }) => {
    Object.assign(product, data);
    return product;
  });
  stub(t, db.product, "update", async ({ data }: { data: { isEssential?: boolean } }) => {
    Object.assign(product, data);
    return product;
  });
  stub(t, db.place, "count", async () => 1);
  stub(t, db.stockItem, "findFirst", async () => stock);
  stub(t, db.stockItem, "findUnique", async () => null);
  const reads = stub(t, db.stockItem, "findMany", async ({ where }: { where: { householdId: string; quantity: { lte: unknown } } }) => {
    assert.equal(where.householdId, actor.householdId);
    assert.deepEqual(where.quantity.lte, db.stockItem.fields.minQuantity);
    return isBelowMinimum(stock.quantity.toNumber(), stock.minQuantity?.toNumber() ?? null) ? [stock] : [];
  });
  const save = async ({ data }: { data: { quantity?: number; minQuantity?: number | null; unit?: string | null; expiresOn?: null } }) => {
    stock = {
      ...stock, ...data,
      quantity: data.quantity === undefined ? stock.quantity : decimal(data.quantity),
      minQuantity: data.minQuantity === undefined ? stock.minQuantity : data.minQuantity === null ? null : decimal(data.minQuantity),
    };
    return stock;
  };
  stub(t, db.stockItem, "create", save);
  stub(t, db.stockItem, "update", save);
  stub(t, db.stockMovement, "create", async ({ data }: { data: unknown }) => {
    movements.push(data);
    return { id: "movement" };
  });
  stub(t, db, "$transaction", async (run: (tx: typeof db) => Promise<unknown>) => run(db));
  const lists = stub(t, db.shoppingList, "upsert", async (input: { create: { name: string } }) => {
    void input;
    return { id: "low-list" };
  });
  stub(t, db.shoppingList, "findMany", async () => []);
  stub(t, db.shoppingStaple, "findMany", async () => []);
  stub(t, db.shoppingItem, "groupBy", async () => []);
  stub(t, db.shoppingItem, "findMany", async () => items.map((item, index) => ({
    id: `item-${index}`, listId: "low-list", list: { name: "Running low" }, name: "Milk",
    unit: null, shopId: null, shop: null, url: null, imageUrl: null, priceCents: null, note: null,
    placeId: "fridge", place: { name: "Fridge" }, category: null, source: "MANUAL", taskId: null,
    boughtAt: null, boughtByUserId: null, createdAt: new Date(), project: null, expenseId: null, mealPlanEntryId: null,
    ...item, quantity: decimal(item.quantity ?? 1),
    product: item.productId ? {
      category: "DAIRY", isEssential: product.isEssential, _count: { alternatives: 0 },
      stockProductId: item.productId === "other-brand" ? "milk" : null,
      stockItems: item.productId === "other-brand" ? [] : [stock],
      stockProduct: item.productId === "other-brand" ? { stockItems: [stock] } : null,
    } : null,
  })));
  stub(t, db.shoppingItem, "count", async ({ where }: { where: { productId: { in: string[] }; status: string } }) =>
    items.filter((item) => item.productId !== null && where.productId.in.includes(item.productId) && item.status === where.status).length);
  stub(t, db.shoppingItem, "create", async ({ data }: { data: typeof items[number] }) => {
    items.push({ ...data, status: "OPEN" });
    return {};
  });
  return { items, movements, reads, lists, product };
}

describe("low stock groceries", () => {
  it("includes equality and a zero minimum, but excludes above minimum and unset minima", () => {
    assert.equal(isBelowMinimum(2, 2), true);
    assert.equal(isBelowMinimum(1, 2), true);
    assert.equal(isBelowMinimum(0, 0), true);
    assert.equal(isBelowMinimum(2.001, 2), false);
    assert.equal(isBelowMinimum(0, null), false);
  });

  for (const quantity of [0, 1, 2]) {
    it(`adds existing stock of ${quantity} at minimum 2 when groceries load, without a movement`, async (t) => {
      const { items, movements, lists } = setup(t, quantity);
      await getShoppingOverview(actor.householdId, actor.locale);
      assert.equal(items.length, 1);
      assert.equal(items[0]?.source, "LOW_STOCK");
      assert.equal(items[0]?.quantity, 2);
      assert.equal(items[0]?.unit, "pack");
      assert.equal(lists.mock.calls[0]?.arguments[0]?.create.name, "Bijna op");
      assert.equal(movements.length, 0);
    });
  }

  it("repeated and concurrent reads keep a single open item", async (t) => {
    const { items, reads } = setup(t);
    await Promise.all([getShoppingOverview(actor.householdId), listItems(actor.householdId)]);
    assert.equal(reads.mock.callCount(), 1);
    await listItems(actor.householdId);
    assert.equal(items.length, 1);
  });

  it("reuses an open alternative and replenishes once that item is bought", async (t) => {
    const { items } = setup(t);
    items.push({ productId: "other-brand", status: "OPEN" });
    await listItems(actor.householdId);
    assert.equal(items.length, 1);
    items[0]!.status = "BOUGHT";
    await listItems(actor.householdId);
    assert.equal(items.length, 2);
    assert.equal(items[1]?.productId, "milk");
  });

  for (const [quantity, minimum] of [[3, 2], [0, null]] as const) {
    it(`does not add stock ${quantity} with minimum ${minimum}`, async (t) => {
      const { items } = setup(t, quantity, minimum);
      await getShoppingOverview(actor.householdId);
      assert.equal(items.length, 0);
    });
  }

  for (const quantity of [0, 2]) {
    it(`adds newly created stock of ${quantity} at or below minimum`, async (t) => {
      const { items } = setup(t);
      const result = await createStockItem(actor, { productId: "milk", placeId: "fridge", quantity, minQuantity: 2 });
      assert.equal(result.isLow, true);
      assert.equal(items.length, 1);
    });
  }

  it("adds stock when only the minimum is increased", async (t) => {
    const { items, movements } = setup(t, 2, 1);
    const result = await updateStockItem(actor, "stock", { quantity: 2, minQuantity: 2 });
    assert.equal(result.addedToShoppingList, true);
    assert.equal(items.length, 1);
    assert.equal(movements.length, 0);
  });

  it("adds stock after a partial restock that still leaves it at minimum", async (t) => {
    const { items } = setup(t, 1, 2);
    const result = await addMovement(actor, "stock", { delta: 1, reason: "bought" });
    assert.equal(result.addedToShoppingList, true);
    assert.equal(items.length, 1);
  });

  for (const quantity of [3, 1]) {
    it(`adds stock after consuming one from ${quantity}, including already-low stock`, async (t) => {
      const { items, movements } = setup(t, quantity, 2);
      const result = await addMovement(actor, "stock", { delta: -1, reason: "scan_use" });
      assert.equal(result.addedToShoppingList, true);
      assert.equal(items.length, 1);
      assert.equal(movements.length, 1);
    });
  }

  it("checks stock even when consumption is clamped at zero", async (t) => {
    const { items, movements } = setup(t, 0, 0);
    const result = await addMovement(actor, "stock", { delta: -1, reason: "scan_use" });
    assert.equal(result.addedToShoppingList, true);
    assert.equal(items.length, 1);
    assert.equal(movements.length, 0);
  });

  it("shows below and at minimum using current stock, including items added manually", async (t) => {
    const { items } = setup(t, 1, 2);
    items.push({ productId: "milk", status: "OPEN", source: "MANUAL" });
    let overview = await getShoppingOverview(actor.householdId);
    assert.equal(overview.items[0]?.stockStatus, "below_minimum");
    assert.equal(overview.items[0]?.isEssential, false);
    await updateStockItem(actor, "stock", { quantity: 2, minQuantity: 2 });
    overview = await getShoppingOverview(actor.householdId);
    assert.equal(overview.items[0]?.stockStatus, "at_minimum");
    await updateStockItem(actor, "stock", { quantity: 3, minQuantity: 2 });
    overview = await getShoppingOverview(actor.householdId);
    assert.equal(overview.items[0]?.stockStatus, "above_minimum");
    assert.equal(overview.items.length, 1);
  });

  it("uses shared stock for an alternative's shopping label", async (t) => {
    const { items } = setup(t, 2, 2);
    items.push({ productId: "other-brand", status: "OPEN" });
    const [item] = await listItems(actor.householdId);
    assert.equal(item?.stockStatus, "at_minimum");
  });

  it("leaves free-text items without product flags", async (t) => {
    const { items } = setup(t, 3, 2);
    items.push({ productId: null, status: "OPEN" });
    const [item] = await listItems(actor.householdId);
    assert.equal(item?.stockStatus, null);
    assert.equal(item?.isEssential, null);
  });

  it("persists essential changes and shows them on existing shopping items", async (t) => {
    const { items } = setup(t, 2, 2);
    items.push({ productId: "milk", status: "OPEN" });
    const created = await createProduct(actor.householdId, { name: "Milk", category: "dairy", isEssential: true });
    assert.equal(created.isEssential, true);
    let [item] = await listItems(actor.householdId);
    assert.equal(item?.isEssential, true);
    const kept = await updateProduct(actor.householdId, "milk", { name: "Fresh milk", category: "dairy" });
    assert.equal(kept.isEssential, true, "older callers changing another field keep the setting");
    const changed = await updateProduct(actor.householdId, "milk", { name: "Milk", category: "dairy", isEssential: false });
    assert.equal(changed.isEssential, false);
    [item] = await listItems(actor.householdId);
    assert.equal(item?.isEssential, false);
  });

  for (const isEssential of [true, false]) {
    for (const quantity of [1, 2]) {
      it(`includes ${isEssential ? "essential" : "nice-to-have"} stock at ${quantity} with minimum 2`, async (t) => {
        const { product } = setup(t, quantity, 2);
        product.isEssential = isEssential;
        const overview = await getShoppingOverview(actor.householdId);
        assert.equal(overview.items.length, 1);
        assert.equal(overview.items[0]?.isEssential, isEssential);
        assert.equal(overview.items[0]?.stockStatus, quantity < 2 ? "below_minimum" : "at_minimum");
      });
    }
  }
});
