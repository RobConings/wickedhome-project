import type { SessionUser } from "@/features/auth/types/auth";
import type { StockPurchaseInput, StockPurchaseReview, StockPurchaseSummary } from "@/features/inventory/types/purchases";
import { db, type Prisma } from "../lib/db";
import { badRequest, HttpError, notFound } from "../lib/http";
import { applyPurchaseChange } from "./inventory.service";

type Actor = Pick<SessionUser, "id" | "householdId" | "locale">;
export type PurchaseContext = StockPurchaseInput & { sourceKey: string; shoppingItemId?: string; trustedShopping?: boolean; shoppingMemberIds?: string[] };
const round = (value: number) => Math.round(value * 1000) / 1000;
const summary = (row: { id: string; quantity: Prisma.Decimal; unit: string | null; shopId: string | null; purchasedAt: Date; stockAdded: boolean }): StockPurchaseSummary => ({ id: row.id, quantity: row.quantity.toNumber(), unit: row.unit, shopId: row.shopId, stockAdded: row.stockAdded, purchasedAt: row.purchasedAt.toISOString() });

export async function purchaseReview(householdId: string, stockItemId: string): Promise<StockPurchaseReview> {
  const stock = await db.stockItem.findFirst({ where: { id: stockItemId, householdId } });
  if (!stock) throw notFound("Stock item not found");
  const purchases = await db.stockPurchase.findMany({ where: { householdId, productId: stock.productId }, orderBy: { purchasedAt: "desc" }, take: 50 });
  const shops = await db.shop.findMany({ where: { householdId, id: { in: [...new Set(purchases.flatMap((purchase) => purchase.shopId ? [purchase.shopId] : []))] } }, select: { id: true, name: true } });
  return { purchases: purchases.map((purchase) => ({ ...summary(purchase), shopName: shops.find((shop) => shop.id === purchase.shopId)?.name ?? null })), lastCountedAt: stock.lastCountedAt?.toISOString() ?? null };
}

export async function recordStockPurchase(actor: Actor, stockItemId: string, input: StockPurchaseInput) {
  if (input.shopId && !await db.shop.count({ where: { id: input.shopId, householdId: actor.householdId } })) throw notFound("Shop not found");
  let sourceKey = `${input.source.kind}:${input.source.reference}`;
  if (input.source.kind === "receipt") {
    if (!input.shopId) throw badRequest("Give the actual shop printed on the receipt");
    const document = await db.documentFile.findFirst({ where: { id: input.source.documentId, householdId: actor.householdId, deletedAt: null, uploadedAt: { not: null } }, select: { sha256: true } });
    if (!document?.sha256) throw badRequest("Upload the receipt before recording its products");
    sourceKey = `receipt:${document.sha256}:${input.source.reference}`;
    if (!input.purchasedAt) throw badRequest("Use the actual receipt date, not its upload date");
  }
  return applyPurchaseChange(actor, stockItemId, { ...input, sourceKey });
}

/** Runs under the source lock and stock row lock, in the SAME transaction as the quantity update. */
export async function preparePurchase(tx: Prisma.TransactionClient, actor: Actor, row: { id: string; productId: string; unit: string | null; lastCountedAt: Date | null }, input: PurchaseContext) {
  const householdId = actor.householdId;
  const existing = await tx.stockPurchaseEvidence.findUnique({ where: { householdId_sourceKey: { householdId, sourceKey: input.sourceKey } } });
  if (existing) {
    if (existing.stockItemId !== row.id || existing.quantity.toNumber() !== round(input.quantity)) throw badRequest("This source was already recorded with different stock or quantity. Review it instead of adding it again.");
    return { delta: 0, purchaseIds: existing.purchaseIds, repeated: true };
  }
  if (input.shoppingMemberIds) {
    const previous = await tx.stockPurchase.findMany({ where: { householdId, shoppingItemId: { in: input.shoppingMemberIds } } });
    if (previous.length) {
      if (previous.some((purchase) => purchase.productId !== row.productId || purchase.stockItemId !== row.id)) throw badRequest("This shopping purchase was already credited to another stock location");
      const ids = previous.map((purchase) => purchase.id);
      await tx.stockPurchaseEvidence.create({ data: { householdId, sourceKey: input.sourceKey, stockItemId: row.id, quantity: input.quantity, purchaseIds: ids } });
      return { delta: 0, purchaseIds: ids, repeated: true };
    }
  }
  if (input.existingPurchaseIds) {
    const ids = [...new Set(input.existingPurchaseIds)];
    const purchases = await tx.stockPurchase.findMany({ where: { id: { in: ids }, householdId, productId: row.productId } });
    if (purchases.length !== ids.length || purchases.some((purchase) => purchase.stockItemId !== row.id || (input.shopId && purchase.shopConfirmed && purchase.shopId && purchase.shopId !== input.shopId))) throw badRequest("These purchases do not belong to this product, stock location and shop");
    const credited = round(purchases.reduce((sum, purchase) => sum + purchase.quantity.toNumber(), 0));
    if (input.source.kind === "receipt" ? credited !== round(input.quantity) : credited < round(input.quantity)) throw badRequest("The quantities differ. Confirm the actual purchased quantity before linking; no stock has been added.");
    if (input.source.kind === "receipt" && await tx.stockPurchaseEvidence.count({ where: { householdId, sourceKey: { startsWith: "receipt:" }, purchaseIds: { hasSome: ids } } })) throw badRequest("A receipt is already linked to this purchase. Choose the actual other purchase or confirm that these are extra products.");
    if (input.shoppingItemId) await tx.stockPurchase.updateMany({ where: { id: { in: ids }, householdId }, data: { shoppingItemId: input.shoppingItemId } });
    if (input.shopId) await tx.stockPurchase.updateMany({ where: { id: { in: ids }, householdId, shopConfirmed: false }, data: { shopId: input.shopId, shopConfirmed: true } });
    await tx.stockPurchaseEvidence.create({ data: { householdId, sourceKey: input.sourceKey, stockItemId: row.id, quantity: input.quantity, purchaseIds: ids } });
    return { delta: 0, purchaseIds: ids, repeated: false };
  }
  const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
  if (purchasedAt.getTime() > Date.now() + 300_000) throw badRequest("A purchase cannot be in the future");
  // Receipts, scans and manual additions may describe an earlier tick. Never dedupe by EAN/name alone.
  const candidates = await tx.stockPurchase.findMany({ where: { householdId, productId: row.productId }, orderBy: { purchasedAt: "desc" }, take: 50 });
  if (candidates.length && !input.separatePurchaseConfirmed) {
    throw new HttpError(409, "purchase_review", `Was this already added, or is it an extra purchase? Link the matching purchase ids or ask the person before confirming an extra purchase. Candidates: ${JSON.stringify(candidates.map(summary))}`, { stockItemId: [row.id] });
  }
  if (row.lastCountedAt && purchasedAt <= row.lastCountedAt && !input.countDisposition) throw new HttpError(409, "purchase_count_review", "Were these products already included in the stock count? Confirm already_counted or add_after_count before continuing.", { stockItemId: [row.id] });
  const stockAdded = input.countDisposition !== "already_counted";
  const purchase = await tx.stockPurchase.create({ data: { householdId, stockItemId: row.id, productId: row.productId, shopId: input.shopId ?? null, shopConfirmed: Boolean(input.shopId && !input.trustedShopping), quantity: input.quantity, unit: row.unit, purchasedAt, stockAdded, shoppingItemId: input.shoppingItemId ?? null, userId: actor.id } });
  await tx.stockPurchaseEvidence.create({ data: { householdId, sourceKey: input.sourceKey, stockItemId: row.id, quantity: input.quantity, purchaseIds: [purchase.id] } });
  return { delta: stockAdded ? input.quantity : 0, purchaseIds: [purchase.id], repeated: false };
}

/** Used only by shopping. A re-tick or legacy restock request reuses the entire position's identity. */
export async function recordShoppingPurchase(actor: Actor, shoppingItemId: string, stockItemId: string, quantity: number, shopId?: string | null, purchasedAt?: string, decision: Pick<StockPurchaseInput, "existingPurchaseIds" | "separatePurchaseConfirmed" | "countDisposition"> = {}) {
  // Every constituent requirement uses the same durable key, so a different visible primary id cannot repost it.
  const { getItem } = await import("../shopping/shopping.service");
  const item = await getItem(actor.householdId, shoppingItemId);
  const ids = (item.requirements?.map((part) => part.id) ?? [item.id]).sort();
  return applyPurchaseChange(actor, stockItemId, { quantity, source: { kind: "manual", reference: `shopping:${ids[0]}` }, sourceKey: `shopping:${ids[0]}`, shoppingItemId: ids[0], shopId: shopId ?? undefined, purchasedAt, trustedShopping: true, shoppingMemberIds: ids, ...decision });
}
