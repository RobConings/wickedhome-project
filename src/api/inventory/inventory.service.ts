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
import type { RestockInput, RestockSuggestion, ShoppingItem } from "@/features/shopping/types/shopping";
import { db, type Prisma, type StockMovementReason as ReasonRow } from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";
import { ensureLowStockItem, findProductByCode, getItem, stockOwnerId } from "../shopping/shopping.service";

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
  const before = row.quantity.toNumber();
  const after = round(Math.max(0, before + delta));
  const applied = round(after - before);

  let movementId: string | null = null;
  const updated = await db.$transaction(async (tx) => {
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
