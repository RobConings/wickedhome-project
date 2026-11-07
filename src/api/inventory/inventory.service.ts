import type { SessionUser } from "@/features/auth/types/auth";
import {
  compareStock,
  isBelowMinimum,
  restockAmount,
  type ProductStock,
  type ScanResult,
  type StockChangeResult,
  type StockItem,
  type StockItemInput,
  type StockItemUpdateInput,
  type StockMovement,
  type StockMovementInput,
  type StockMovementReason,
} from "@/features/inventory/types/inventory";
import type { ProductCategory, RestockInput, RestockSuggestion, ShoppingItem } from "@/features/shopping/types/shopping";
import { convertAmount, normalizeUnit } from "@/types/units";
import { db, type ProductCategory as ProductCategoryRow, type Prisma, type StockMovementReason as ReasonRow } from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";
import { ensureLowStockItem, findProductByCode, getItem, stockOwnerId } from "../shopping/shopping.service";
import { lockStock } from "./stock-lock";

/*
 * Stock and thresholds
 * ────────────────────
 * A StockItem is "product P at place X". Every change goes through `applyChange`, which logs a
 * StockMovement (delta, reason, who) and, when the result is at or below the item's minimum, asks Shopping to
 * put the product on the "Running low" list for its default shop (Shopping skips it when an open item
 * for the product already exists). Quantities never go below zero.
 *
 * Alternatives (docs/INVENTORY.md): products that share stock point at a main product, and only that main
 * product has stock items. Every read and change by product id resolves to that owner first.
 */

const toReason = (reason: ReasonRow) => reason.toLowerCase() as StockMovementReason;
const fromReason = (reason: StockMovementReason) => reason.toUpperCase() as ReasonRow;
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);
const round = (value: number) => Math.round(value * 1000) / 1000;
const fromCategory = (category: ProductCategory) => category.toUpperCase() as ProductCategoryRow;

const stockInclude = {
  product: { select: { name: true, unit: true } },
  place: { select: { name: true } },
} as const;
type StockRow = Prisma.StockItemGetPayload<{ include: typeof stockInclude }>;

function toStockItem(row: StockRow): StockItem {
  const quantity = row.quantity.toNumber();
  const minQuantity = row.minQuantity?.toNumber() ?? null;
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    placeId: row.placeId,
    placeName: row.place.name,
    quantity,
    unit: row.unit ?? row.product.unit,
    minQuantity,
    expiresOn: row.expiresOn ? fromDate(row.expiresOn) : null,
    isLow: isBelowMinimum(quantity, minQuantity),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findOwnStock(householdId: string, id: string) {
  const row = await db.stockItem.findFirst({ where: { id, householdId }, include: stockInclude });
  if (!row) throw notFound("Stock item not found");
  return row;
}

/** The stock owner of a product, or null when it isn't the household's. */
const ownerOrNull = (householdId: string, productId: string) => stockOwnerId(householdId, productId).catch(() => null);

/** Checks the product and place; returns the product whose stock it is (alternatives share their main's). */
async function assertRefs(householdId: string, productId: string, placeId: string) {
  const [owner, place] = await Promise.all([ownerOrNull(householdId, productId), db.place.count({ where: { id: placeId, householdId } })]);
  const fields: Record<string, string[]> = {};
  if (!owner) fields.productId = ["Unknown product"];
  if (!place) fields.placeId = ["Unknown place"];
  if (!owner || Object.keys(fields).length > 0) throw badRequest("Validation failed", fields);
  return owner;
}

type Actor = Pick<SessionUser, "id" | "householdId" | "locale">;

type ChangeExtra = {
  note?: string | null;
  shoppingItemId?: string;
  /** The meal being cooked, for `cooked` movements (recipes feature). */
  mealPlanEntryId?: string;
};

/** Changes a stock quantity by `delta` (clamped at zero), logs it and checks the threshold. */
async function applyChange(actor: Actor, row: StockRow, delta: number, reason: StockMovementReason, extra: ChangeExtra = {}): Promise<StockChangeResult> {
  const { movementId: _movementId, ...result } = await applyChangeLogged(actor, row, delta, reason, extra);
  return result;
}

/** `applyChange`, also returning the movement it logged (null when nothing changed, e.g. already at zero). */
async function applyChangeLogged(
  actor: Actor,
  row: StockRow,
  delta: number,
  reason: StockMovementReason,
  extra: ChangeExtra = {},
): Promise<StockChangeResult & { movementId: string | null; applied: number }> {
  let movementId: string | null = null;
  let applied = 0;
  const updated = await db.$transaction(async (tx) => {
    await lockStock(tx, actor.householdId);
    const current = await tx.stockItem.findFirst({ where: { id: row.id, householdId: actor.householdId } });
    if (!current) throw notFound("Stock item not found");
    const before = current.quantity.toNumber();
    const after = round(Math.max(0, before + delta));
    applied = round(after - before);
    const next = await tx.stockItem.update({ where: { id: row.id }, data: { quantity: after }, include: stockInclude });
    if (applied !== 0) {
      const movement = await tx.stockMovement.create({
        data: {
          householdId: actor.householdId,
          stockItemId: row.id,
          delta: applied,
          quantityAfter: after,
          reason: fromReason(reason),
          userId: actor.id,
          note: extra.note || null,
          shoppingItemId: extra.shoppingItemId ?? null,
          mealPlanEntryId: extra.mealPlanEntryId ?? null,
        },
      });
      movementId = movement.id;
    }
    return next;
  });

  return { ...(await checkLowStock(actor, updated)), movementId, applied };
}

/** Checks the current stock, including creation and edits that only change the minimum. */
async function checkLowStock(actor: Actor, row: StockRow): Promise<StockChangeResult> {
  const stockItem = toStockItem(row);
  let addedToShoppingList = false;
  if (stockItem.isLow && stockItem.minQuantity !== null) {
    addedToShoppingList = await ensureLowStockItem(
      actor.householdId,
      {
        productId: stockItem.productId,
        placeId: stockItem.placeId,
        quantity: restockAmount(stockItem.minQuantity),
        unit: stockItem.unit,
      },
      actor.locale,
    );
  }
  return { stockItem, addedToShoppingList };
}

// Reads --------------------------------------------------------------------------------------------------

/** Stock items, low stock first. `productId` may be an alternative: its main product's stock is listed. */
export async function listStock(householdId: string, filter: { placeId?: string; productId?: string } = {}) {
  const productId = filter.productId && ((await ownerOrNull(householdId, filter.productId)) ?? filter.productId);
  const rows = await db.stockItem.findMany({
    where: { householdId, ...(filter.placeId && { placeId: filter.placeId }), ...(productId && { productId }) },
    include: stockInclude,
  });
  return rows.map(toStockItem).sort(compareStock);
}

const MOVEMENT_LIMIT = 50;

export type InventoryPurchase = {
  product: string;
  place: string;
  quantity: number;
  unit: string | null;
  receiptAttached: boolean;
  note: string | null;
  userName: string | null;
  createdAt: string;
};

/** Recent purchase movements, newest first. */
export async function listPurchases(householdId: string, input: { since: Date; limit: number }): Promise<InventoryPurchase[]> {
  const rows = await db.stockMovement.findMany({
    where: { householdId, reason: "BOUGHT", createdAt: { gte: input.since } },
    include: {
      stockItem: { select: { product: { select: { name: true, unit: true } }, place: { select: { name: true } }, unit: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit,
  });
  const userIds = [...new Set(rows.flatMap((row) => (row.userId ? [row.userId] : [])))];
  const users = userIds.length
    ? await db.user.findMany({
        where: { householdId, id: { in: userIds } },
        select: { id: true, email: true, habitant: { select: { name: true } } },
      })
    : [];
  const names = new Map(users.map((user) => [user.id, user.habitant?.name ?? user.email]));
  return rows.map((row) => ({
    product: row.stockItem.product.name,
    place: row.stockItem.place.name,
    quantity: row.delta.toNumber(),
    unit: row.stockItem.unit ?? row.stockItem.product.unit,
    receiptAttached: row.assistantImageId !== null,
    note: row.note,
    userName: row.userId ? (names.get(row.userId) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** A product's stock and history; for an alternative, those of its main product (`productId` is the owner). */
export async function getProductStock(householdId: string, requestedId: string): Promise<ProductStock> {
  const productId = await stockOwnerId(householdId, requestedId);
  const [stockItems, rows] = await Promise.all([
    listStock(householdId, { productId }),
    db.stockMovement.findMany({
      where: { householdId, stockItem: { productId } },
      include: { stockItem: { select: { place: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: MOVEMENT_LIMIT,
    }),
  ]);
  const userIds = [...new Set(rows.flatMap((row) => (row.userId ? [row.userId] : [])))];
  const users = userIds.length
    ? await db.user.findMany({
        where: { householdId, id: { in: userIds } },
        select: { id: true, email: true, habitant: { select: { name: true } } },
      })
    : [];
  const names = new Map(users.map((user) => [user.id, user.habitant?.name ?? user.email]));
  const movements = rows.map(
    (row): StockMovement => ({
      id: row.id,
      stockItemId: row.stockItemId,
      placeName: row.stockItem.place.name,
      delta: row.delta.toNumber(),
      quantityAfter: row.quantityAfter.toNumber(),
      reason: toReason(row.reason),
      userName: row.userId ? (names.get(row.userId) ?? null) : null,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }),
  );
  return { productId, stockItems, movements };
}

/** What a scanned code is. An alternative's scan acts on the shared stock of its main product. */
export async function scanCode(householdId: string, code: string): Promise<ScanResult> {
  const product = await findProductByCode(householdId, code);
  const owner = product ? (product.stockProductId ?? product.id) : null;
  return {
    code,
    productId: owner,
    scannedProductId: product?.id ?? null,
    stockItems: owner ? await listStock(householdId, { productId: owner }) : [],
  };
}

// Changes ------------------------------------------------------------------------------------------------

export async function createStockItem(actor: Actor, input: StockItemInput): Promise<StockItem> {
  // An alternative is kept as its main product (the stock they share).
  const productId = await assertRefs(actor.householdId, input.productId, input.placeId);
  const existing = await db.stockItem.findUnique({
    where: { productId_placeId: { productId, placeId: input.placeId } },
  });
  if (existing) throw conflict("This product is already kept at this place");
  const row = await db.stockItem.create({
    data: {
      householdId: actor.householdId,
      productId,
      placeId: input.placeId,
      quantity: 0,
      unit: input.unit || null,
      minQuantity: input.minQuantity ?? null,
      expiresOn: input.expiresOn ? toDate(input.expiresOn) : null,
    },
    include: stockInclude,
  });
  if (input.quantity > 0) return (await applyChange(actor, row, input.quantity, "manual_correction")).stockItem;
  return (await checkLowStock(actor, row)).stockItem;
}

export async function updateStockItem(actor: Actor, id: string, input: StockItemUpdateInput): Promise<StockChangeResult> {
  const row = await findOwnStock(actor.householdId, id);
  const updated = await db.stockItem.update({
    where: { id },
    data: {
      unit: input.unit || null,
      minQuantity: input.minQuantity ?? null,
      expiresOn: input.expiresOn ? toDate(input.expiresOn) : null,
    },
    include: stockInclude,
  });
  const delta = round(input.quantity - row.quantity.toNumber());
  if (delta !== 0) return applyChange(actor, updated, delta, "manual_correction");
  return checkLowStock(actor, updated);
}

export async function deleteStockItem(householdId: string, id: string): Promise<void> {
  await findOwnStock(householdId, id);
  await db.stockItem.delete({ where: { id } });
}

export async function addMovement(actor: Actor, id: string, input: StockMovementInput): Promise<StockChangeResult> {
  const row = await findOwnStock(actor.householdId, id);
  return applyChange(actor, row, input.delta, input.reason, { note: input.note });
}

export type RecordPurchaseLine = {
  product: string;
  quantity: number;
  unit?: string;
  placeId: string;
  category?: ProductCategory;
};

/**
 * Adds receipt lines to stock and creates missing catalogue products in one transaction. Each purchase is
 * retained as a BOUGHT movement; a unit that conflicts with the product's existing stock unit is refused.
 */
export async function recordPurchases(actor: Actor, lines: RecordPurchaseLine[], receiptImageId?: string, note?: string): Promise<StockItem[]> {
  const saved = await db.$transaction(async (tx) => {
    await lockStock(tx, actor.householdId);
    if (receiptImageId) {
      const receipt = await tx.assistantImage.updateMany({
        where: { id: receiptImageId, userId: actor.id, messageId: { not: null }, inventoryPurchaseRecordedAt: null },
        data: { inventoryPurchaseRecordedAt: new Date() },
      });
      if (receipt.count === 0) {
        const exists = await tx.assistantImage.count({ where: { id: receiptImageId, userId: actor.id, messageId: { not: null } } });
        if (!exists) throw badRequest("The attached receipt image is no longer available. Attach it again and retry.");
        throw conflict("This receipt image has already been recorded in stock; check purchase history before retrying.");
      }
    }

    const changed: { stockItemId: string; product: string }[] = [];
    for (const line of lines) {
      const place = await tx.place.findFirst({
        where: { id: line.placeId, householdId: actor.householdId },
        select: { id: true },
      });
      if (!place) throw badRequest("Validation failed", { place: ["Unknown place"] });

      const matches = await tx.product.findMany({
        where: { householdId: actor.householdId, name: { equals: line.product, mode: "insensitive" } },
        select: { id: true, name: true, unit: true, stockProductId: true },
      });
      if (matches.length > 1) throw badRequest(`More than one product is named "${line.product}"; choose or rename the matching catalogue product first.`);
      const product = matches[0] ?? await tx.product.create({
        data: {
          householdId: actor.householdId,
          name: line.product,
          unit: line.unit ?? null,
          category: fromCategory(line.category ?? "other"),
        },
        select: { id: true, name: true, unit: true, stockProductId: true },
      });
      const productId = product.stockProductId ?? product.id;
      let stockItem = await tx.stockItem.findUnique({
        where: { productId_placeId: { productId, placeId: place.id } },
        include: stockInclude,
      });
      let quantity = line.quantity;
      if (stockItem) {
        const existingUnit = stockItem.unit ?? stockItem.product.unit;
        if (line.unit && existingUnit) {
          const converted = normalizeUnit(line.unit) === normalizeUnit(existingUnit)
            ? line.quantity
            : convertAmount(line.quantity, line.unit, existingUnit);
          if (converted === null) {
            throw badRequest(`The stock unit for ${product.name} is "${existingUnit}", but the receipt says "${line.unit}". These units cannot be converted safely; update the product unit or use a matching receipt unit.`);
          }
          quantity = converted;
        }
        if (!stockItem.unit && !stockItem.product.unit && line.unit) {
          stockItem = await tx.stockItem.update({
            where: { id: stockItem.id },
            data: { unit: line.unit },
            include: stockInclude,
          });
        }
      } else {
        stockItem = await tx.stockItem.create({
          data: {
            householdId: actor.householdId,
            productId,
            placeId: place.id,
            quantity: 0,
            unit: line.unit ?? null,
          },
          include: stockInclude,
        });
      }

      const updated = await tx.stockItem.update({
        where: { id: stockItem.id },
        data: { quantity: { increment: quantity } },
        include: stockInclude,
      });
      await tx.stockMovement.create({
        data: {
          householdId: actor.householdId,
          stockItemId: updated.id,
          delta: quantity,
          quantityAfter: updated.quantity,
          reason: "BOUGHT",
          userId: actor.id,
          assistantImageId: receiptImageId ?? null,
          note: note || null,
        },
      });
      changed.push({ stockItemId: updated.id, product: product.name });
    }
    return changed;
  });

  const stockItems = await db.stockItem.findMany({
    where: { householdId: actor.householdId, id: { in: [...new Set(saved.map((item) => item.stockItemId))] } },
    include: stockInclude,
  });
  const checked = await Promise.all(stockItems.map((item) => checkLowStock(actor, item)));
  const byId = new Map(checked.map(({ stockItem }) => [stockItem.id, stockItem]));
  return saved.map(({ stockItemId }) => byId.get(stockItemId)!).filter(Boolean);
}

// Shopping → stock ---------------------------------------------------------------------------------------

/**
 * Where a just-bought item could go in stock: the stock item for its product at the item's place, else
 * the product's lowest stock item. Null when the product isn't kept in stock. An alternative restocks the
 * stock it shares (listStock resolves the owner).
 */
export async function findRestockTarget(householdId: string, item: ShoppingItem): Promise<RestockSuggestion | null> {
  if (!item.productId) return null;
  const stock = await listStock(householdId, { productId: item.productId });
  const target =
    stock.find((candidate) => candidate.placeId === item.placeId) ??
    [...stock].sort((a, b) => a.quantity - (a.minQuantity ?? 0) - (b.quantity - (b.minQuantity ?? 0)))[0];
  if (!target) return null;
  return {
    stockItemId: target.id,
    placeId: target.placeId,
    placeName: target.placeName,
    quantity: item.quantity,
    unit: item.unit ?? target.unit,
  };
}

export async function restockFromShoppingItem(actor: Actor, shoppingItemId: string, input: RestockInput) {
  const item = await getItem(actor.householdId, shoppingItemId);
  const row = await findOwnStock(actor.householdId, input.stockItemId);
  // Any product of the group may restock the shared stock: compare stock owners.
  const owner = item.productId ? await ownerOrNull(actor.householdId, item.productId) : null;
  if (item.productId && owner !== row.productId) {
    throw badRequest("Validation failed", { stockItemId: ["This stock item holds another product"] });
  }
  return applyChange(actor, row, input.quantity, "bought", { shoppingItemId });
}

// Recipes → stock ----------------------------------------------------------------------------------------

/** Total stock of a product (its group's shared stock), or null when it isn't kept anywhere. For Recipes. */
export async function stockTotal(householdId: string, productId: string): Promise<number | null> {
  const stock = await listStock(householdId, { productId });
  return stock.length ? round(stock.reduce((sum, item) => sum + item.quantity, 0)) : null;
}

/** Cooking result: the movement (null when nothing could be taken: not kept in stock, or already at zero). */
export type CookedStockChange = { movementId: string | null; applied: number; stockItem: StockItem | null; addedToShoppingList: boolean };

/**
 * For Recipes: takes `quantity` of a product out of stock while cooking (reason `cooked`, linked to the meal).
 * An alternative uses its group's shared stock. With several places, the place that covers the amount with the
 * least left over is used, else the fullest one. Low stock goes on the shopping list as with every change.
 */
export async function useStockForCooking(actor: Actor, productId: string, quantity: number, mealPlanEntryId: string, note?: string | null): Promise<CookedStockChange> {
  const owner = await stockOwnerId(actor.householdId, productId);
  const rows = await db.stockItem.findMany({ where: { householdId: actor.householdId, productId: owner }, include: stockInclude });
  if (rows.length === 0) return { movementId: null, applied: 0, stockItem: null, addedToShoppingList: false };
  const amount = (row: StockRow) => row.quantity.toNumber();
  const covering = rows.filter((row) => amount(row) >= quantity).sort((a, b) => amount(a) - amount(b));
  const row = covering[0] ?? [...rows].sort((a, b) => amount(b) - amount(a))[0]!;
  const result = await applyChangeLogged(actor, row, -quantity, "cooked", { mealPlanEntryId, note });
  return { movementId: result.movementId, applied: result.applied, stockItem: result.stockItem, addedToShoppingList: result.addedToShoppingList };
}

/** For Recipes: undoes a `cooked` movement with a correcting one (puts back what it took). Unknown ids do nothing. */
export async function revertCookedMovement(actor: Actor, movementId: string, note?: string | null): Promise<void> {
  const movement = await db.stockMovement.findFirst({ where: { id: movementId, householdId: actor.householdId, reason: "COOKED" } });
  if (!movement) return;
  const row = await db.stockItem.findFirst({ where: { id: movement.stockItemId, householdId: actor.householdId }, include: stockInclude });
  if (!row) return;
  await applyChange(actor, row, -movement.delta.toNumber(), "cooked", { mealPlanEntryId: movement.mealPlanEntryId ?? undefined, note });
}
