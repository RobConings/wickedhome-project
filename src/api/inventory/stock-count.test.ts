import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import { stockCountInputSchema } from "@/features/inventory/types/inventory";
import { db, Prisma } from "../lib/db";
import { addMovement, setStockCount } from "./inventory.service";

const actor = { id: "rob", householdId: "home", locale: "nl" as const };
const decimal = (value: number) => new Prisma.Decimal(value);
function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original = Reflect.get(target, key);
  const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement);
  t.after(() => { Reflect.set(target, key, original); });
  return replacement;
}
function setup(t: TestContext, min: number | null = null) {
  let stock = {
    id: "stock", householdId: "home", productId: "milk", placeId: "kitchen", quantity: decimal(2), unit: "pak",
    minQuantity: min === null ? null : decimal(min), expiresOn: new Date("2026-11-10"), updatedAt: new Date("2026-10-31T10:00:00Z"),
    product: { name: "Melk", unit: "pak", shoppingRestockState: "ACTIVE" }, place: { name: "Keuken" },
  };
  const movements: { delta: number; quantityAfter: number; reason: string; note?: string | null }[] = [];
  stub(t, db.stockItem, "findFirst", async ({ where }: { where: { id: string; householdId: string } }) => where.id === stock.id && where.householdId === stock.householdId ? stock : null);
  stub(t, db.stockItem, "findFirstOrThrow", async () => stock);
  stub(t, db, "$queryRaw", async () => []);
  stub(t, db.stockItem, "update", async ({ data }: { data: { quantity: number } }) => {
    stock = { ...stock, quantity: decimal(data.quantity), updatedAt: new Date(stock.updatedAt.getTime() + 1) };
    return stock;
  });
  const save = stub(t, db.stockItem, "updateMany", async ({ where, data }: { where: { id: string; householdId: string; updatedAt: Date }; data: { quantity: number } }) => {
    if (where.id !== stock.id || where.householdId !== stock.householdId || where.updatedAt.getTime() !== stock.updatedAt.getTime()) return { count: 0 };
    stock = { ...stock, quantity: decimal(data.quantity), updatedAt: new Date(stock.updatedAt.getTime() + 1) };
    return { count: 1 };
  });
  stub(t, db.stockMovement, "create", async ({ data }: { data: typeof movements[number] }) => { movements.push(data); return { id: "movement" }; });
  stub(t, db, "$transaction", async (run: (tx: typeof db) => Promise<unknown>) => run(db));
  return { movements, save, read: () => stock, externalChange: (quantity: number) => { stock = { ...stock, quantity: decimal(quantity), updatedAt: new Date(stock.updatedAt.getTime() + 1) }; } };
}

it("overwrites a count, records only the difference and preserves minimum, unit and expiry", async (t) => {
  const { read, movements } = setup(t, 3);
  const result = await setStockCount(actor, "stock", { quantity: 7, expectedUpdatedAt: read().updatedAt.toISOString() });
  assert.equal(result.stockItem.quantity, 7);
  assert.equal(result.stockItem.minQuantity, 3);
  assert.equal(result.stockItem.unit, "pak");
  assert.equal(result.stockItem.expiresOn, "2026-11-10");
  assert.equal(movements.length, 1);
  assert.equal(movements[0]?.delta, 5);
  assert.equal(movements[0]?.quantityAfter, 7);
  assert.equal(movements[0]?.reason, "MANUAL_CORRECTION");
  assert.equal(movements[0]?.note, "Voorraadtelling");
});

it("accepts an intentional zero and does not treat a retry as another stock movement", async (t) => {
  const { read, movements, save } = setup(t);
  const expectedUpdatedAt = read().updatedAt.toISOString();
  await setStockCount(actor, "stock", { quantity: 0, expectedUpdatedAt });
  await setStockCount(actor, "stock", { quantity: 0, expectedUpdatedAt });
  assert.equal(read().quantity.toNumber(), 0);
  assert.equal(movements.length, 1);
  assert.equal(movements[0]?.delta, -2);
  assert.equal(save.mock.callCount(), 2); // Same-value retries refresh only the count watermark, never the quantity delta.
});

it("refuses a stale count instead of overwriting a more recent stock change", async (t) => {
  const { read, externalChange, movements, save } = setup(t);
  const expectedUpdatedAt = read().updatedAt.toISOString();
  externalChange(4);
  await assert.rejects(setStockCount(actor, "stock", { quantity: 3, expectedUpdatedAt }), /Stock changed/);
  assert.equal(read().quantity.toNumber(), 4);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(movements.length, 0);
});

it("also catches a change between reading the stock and writing the new count", async (t) => {
  const { read, externalChange, movements } = setup(t);
  const expectedUpdatedAt = read().updatedAt.toISOString();
  stub(t, db.stockItem, "updateMany", async () => { externalChange(4); return { count: 0 }; });
  await assert.rejects(setStockCount(actor, "stock", { quantity: 3, expectedUpdatedAt }), /Stock changed/);
  assert.equal(read().quantity.toNumber(), 4);
  assert.equal(movements.length, 0);
});

it("cannot count stock owned by another household", async (t) => {
  const { read, save } = setup(t);
  await assert.rejects(setStockCount({ ...actor, householdId: "other" }, "stock", { quantity: 0, expectedUpdatedAt: read().updatedAt.toISOString() }), /not found/i);
  assert.equal(save.mock.callCount(), 0);
});

it("requires an explicit valid quantity and revision; an empty field is never zero", () => {
  const expectedUpdatedAt = "2026-10-31T10:00:00.000Z";
  for (const quantity of ["", "   ", undefined, null, false, [], -1, 100001, NaN]) assert.equal(stockCountInputSchema.safeParse({ quantity, expectedUpdatedAt }).success, false);
  assert.equal(stockCountInputSchema.parse({ quantity: 0, expectedUpdatedAt }).quantity, 0);
  assert.equal(stockCountInputSchema.safeParse({ quantity: 1 }).success, false);
});

it("a scan that started before a count adds to the new count instead of overwriting it", async (t) => {
  const { read, externalChange, movements } = setup(t);
  stub(t, db, "$queryRaw", async () => { externalChange(5); return []; });
  await addMovement(actor, "stock", { delta: 1, reason: "scan_add" });
  assert.equal(read().quantity.toNumber(), 6);
  assert.equal(movements[0]?.delta, 1);
  assert.equal(movements[0]?.quantityAfter, 6);
});
