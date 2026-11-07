import type { TestContext } from "node:test";
import { db, Prisma } from "../lib/db";
export const actor = { id: "rob", householdId: "home", locale: "nl" as const };
const decimal = (value: number) => new Prisma.Decimal(value);
function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original = Reflect.get(target, key); const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement); t.after(() => { Reflect.set(target, key, original); }); return replacement;
}
type Purchase = { id: string; householdId: string; stockItemId: string; productId: string; shopId: string | null; quantity: Prisma.Decimal; unit: string | null; purchasedAt: Date; stockAdded: boolean; shoppingItemId: string | null; userId: string };
type Evidence = { householdId: string; sourceKey: string; stockItemId: string; quantity: Prisma.Decimal; purchaseIds: string[] };
export function setup(t: TestContext) {
  let stock = { id: "stock", householdId: "home", productId: "milk", placeId: "kitchen", quantity: decimal(2), minQuantity: null, unit: "pak", expiresOn: null, lastCountedAt: null as Date | null, updatedAt: new Date("2026-10-30T10:00:00Z"), product: { name: "Melk", unit: "pak", shoppingRestockState: "ACTIVE" }, place: { name: "Keuken" } };
  let purchases: Purchase[] = []; let evidence: Evidence[] = []; let movements: { delta: number; quantityAfter: number }[] = [];
  let failMovement = false; let tail = Promise.resolve();
  const locks = stub(t, db, "$queryRaw", async (...args: unknown[]) => { void args; return []; });
  stub(t, db.stockItem, "findFirst", async ({ where }: { where: { id: string; householdId: string } }) => where.id === stock.id && where.householdId === stock.householdId ? stock : null);
  stub(t, db.stockItem, "findFirstOrThrow", async () => stock);
  stub(t, db.stockItem, "update", async ({ data }: { data: { quantity: number } }) => { stock = { ...stock, quantity: decimal(data.quantity), updatedAt: new Date(stock.updatedAt.getTime() + 1) }; return stock; });
  stub(t, db.stockItem, "updateMany", async ({ where, data }: { where: { updatedAt: Date }; data: { quantity: number; lastCountedAt?: Date } }) => { if (where.updatedAt.getTime() !== stock.updatedAt.getTime()) return { count: 0 }; stock = { ...stock, ...data, quantity: decimal(data.quantity), updatedAt: new Date(stock.updatedAt.getTime() + 1) }; return { count: 1 }; });
  stub(t, db.stockMovement, "create", async ({ data }: { data: typeof movements[number] }) => { if (failMovement) throw new Error("movement failed"); movements.push(data); return { id: `movement-${movements.length}` }; });
  stub(t, db.stockPurchaseEvidence, "findUnique", async ({ where }: { where: { householdId_sourceKey: { householdId: string; sourceKey: string } } }) => evidence.find((entry) => entry.householdId === where.householdId_sourceKey.householdId && entry.sourceKey === where.householdId_sourceKey.sourceKey) ?? null);
  stub(t, db.stockPurchaseEvidence, "create", async ({ data }: { data: Omit<Evidence, "quantity"> & { quantity: number } }) => { if (evidence.some((entry) => entry.householdId === data.householdId && entry.sourceKey === data.sourceKey)) throw new Error("duplicate source"); const entry = { ...data, quantity: decimal(data.quantity) }; evidence.push(entry); return entry; });
  stub(t, db.stockPurchaseEvidence, "count", async ({ where }: { where: { householdId: string; sourceKey: { startsWith: string }; purchaseIds: { hasSome: string[] } } }) => evidence.filter((entry) => entry.householdId === where.householdId && entry.sourceKey.startsWith(where.sourceKey.startsWith) && entry.purchaseIds.some((id) => where.purchaseIds.hasSome.includes(id))).length);
  stub(t, db.stockPurchase, "findMany", async ({ where }: { where: { householdId: string; productId?: string; id?: { in: string[] }; shoppingItemId?: { in: string[] }; purchasedAt?: { gte: Date; lte?: Date } } }) => purchases.filter((entry) => entry.householdId === where.householdId && (!where.productId || entry.productId === where.productId) && (!where.id || where.id.in.includes(entry.id)) && (!where.shoppingItemId || Boolean(entry.shoppingItemId && where.shoppingItemId.in.includes(entry.shoppingItemId))) && (!where.purchasedAt || entry.purchasedAt >= where.purchasedAt.gte && (!where.purchasedAt.lte || entry.purchasedAt <= where.purchasedAt.lte))));
  stub(t, db.stockPurchase, "create", async ({ data }: { data: Omit<Purchase, "id" | "quantity"> & { quantity: number } }) => { const entry = { ...data, id: `purchase-${purchases.length + 1}`, quantity: decimal(data.quantity) }; purchases.push(entry); return entry; });
  stub(t, db.stockPurchase, "updateMany", async ({ where, data }: { where: { id: { in: string[] }; shopId?: null }; data: Partial<Purchase> }) => { purchases = purchases.map((entry) => where.id.in.includes(entry.id) && (where.shopId !== null || entry.shopId === null) ? { ...entry, ...data } : entry); return { count: 1 }; });
  stub(t, db.shop, "count", async ({ where }: { where: { householdId: string; id: string } }) => where.householdId === "home" && ["a", "b"].includes(where.id) ? 1 : 0);
  stub(t, db.documentFile, "findFirst", async ({ where }: { where: { householdId: string; id: string } }) => where.householdId === "home" && where.id.startsWith("doc") ? { sha256: where.id === "doc-copy" ? "doc-a" : where.id } : null);
  // Emulates transaction rollback and a DB row lock; SQL lock calls are separately asserted.
  stub(t, db, "$transaction", async (run: (tx: typeof db) => Promise<unknown>) => {
    const prior = tail; let release!: () => void; tail = new Promise<void>((resolve) => { release = resolve; }); await prior;
    const original = { stock, purchases: [...purchases], evidence: [...evidence], movements: [...movements] };
    try { return await run(db); } catch (error) { stock = original.stock; purchases = original.purchases; evidence = original.evidence; movements = original.movements; throw error; } finally { release(); }
  });
  return { stub: <T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(target: T, key: K, implementation: F) => stub(t, target, key, implementation), read: () => ({ stock, purchases, evidence, movements }), locks, fail: () => { failMovement = true; }, foreign: () => { purchases.push({ id: "foreign", householdId: "other", stockItemId: "stock", productId: "milk", shopId: null, quantity: decimal(1), unit: "pak", purchasedAt: new Date(), stockAdded: true, shoppingItemId: null, userId: "other" }); } };
}
