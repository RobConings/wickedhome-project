import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";

/** `cooked`: used while cooking a meal (recipes feature, linked to the meal); also its undo. */
export const STOCK_MOVEMENT_REASONS = ["scan_use", "scan_add", "bought", "manual_correction", "cooked"] as const;
export const stockMovementReasonSchema = z.enum(STOCK_MOVEMENT_REASONS);
export type StockMovementReason = z.infer<typeof stockMovementReasonSchema>;

const amountSchema = z.coerce
  .number()
  .min(0)
  .max(100_000)
  .transform((value) => Math.round(value * 1000) / 1000);

/** Body of `POST /api/inventory/stock`: start keeping a product at a place. */
export const stockItemInputSchema = z.object({
  productId: idSchema,
  placeId: idSchema,
  quantity: amountSchema.default(0),
  unit: z.string().trim().max(20).optional().nullable(),
  minQuantity: amountSchema.optional().nullable(),
  expiresOn: isoDateSchema.optional().nullable(),
});
export type StockItemInput = z.infer<typeof stockItemInputSchema>;

/** Body of `PUT /api/inventory/stock/:id`. A changed quantity is logged as a manual correction. */
export const stockItemUpdateSchema = z.object({
  quantity: amountSchema,
  unit: z.string().trim().max(20).optional().nullable(),
  minQuantity: amountSchema.optional().nullable(),
  expiresOn: isoDateSchema.optional().nullable(),
});
export type StockItemUpdateInput = z.infer<typeof stockItemUpdateSchema>;

/** The edit form as posted (browser validation and the route action): an empty quantity means 0. */
export const stockItemUpdateFormSchema = stockItemUpdateSchema.extend({
  quantity: z.preprocess((value) => value ?? 0, stockItemUpdateSchema.shape.quantity),
});

/** Body of `POST /api/inventory/stock/:id/movements`. */
export const stockMovementInputSchema = z.object({
  delta: z.coerce
    .number()
    .min(-100_000)
    .max(100_000)
    .refine((value) => value !== 0, "Must not be zero")
    .transform((value) => Math.round(value * 1000) / 1000),
  reason: stockMovementReasonSchema,
  note: z.string().trim().max(200).optional().nullable(),
});
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;

/** What a scan does: use one, add one, or just tell what the product is. */
export const SCAN_MODES = ["use", "add", "identify"] as const;
export type ScanMode = (typeof SCAN_MODES)[number];

/** Query of `GET /api/inventory/scan`: a barcode (EAN) or the value of one of our own QR labels. */
export const scanQuerySchema = z.object({ code: z.string().trim().min(1).max(64) });

// Read models --------------------------------------------------------------------------------------------

export type StockItem = {
  id: string;
  productId: string;
  productName: string;
  placeId: string;
  placeName: string;
  quantity: number;
  /** The stock item's unit, else the product's. */
  unit: string | null;
  minQuantity: number | null;
  expiresOn: string | null;
  /** At or below the minimum. */
  isLow: boolean;
  /** ISO timestamp. */
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  stockItemId: string;
  placeName: string;
  delta: number;
  quantityAfter: number;
  reason: StockMovementReason;
  userName: string | null;
  note: string | null;
  /** ISO timestamp. */
  createdAt: string;
};

/** `GET /api/inventory/products/:productId`: where a product is kept and what happened to it. */
export type ProductStock = {
  productId: string;
  stockItems: StockItem[];
  /** Newest first. */
  movements: StockMovement[];
};

/**
 * `GET /api/inventory/scan?code=`. `productId` is the product whose stock it is (the main product when the
 * scanned one is an alternative), `scannedProductId` the product the code belongs to. Both null for an
 * unknown code.
 */
export type ScanResult = {
  code: string;
  productId: string | null;
  scannedProductId: string | null;
  stockItems: StockItem[];
};

/** Response of a stock change. */
export type StockChangeResult = {
  stockItem: StockItem;
  /** Stock is at or below the minimum and a shopping item was added. */
  addedToShoppingList: boolean;
};

// Helpers shared by the API and the UI -------------------------------------------------------------------

type Role = "owner" | "adult" | "child";

/** Everyone uses and adds stock (scanning a yoghurt); setting up stock and thresholds is for adults. */
export const canChangeStock = (_role: Role) => true;
export const canManageStock = (role: Role) => role !== "child";

export const isBelowMinimum = (quantity: number, minQuantity: number | null) =>
  minQuantity !== null && quantity <= minQuantity;

/** How much to put on the shopping list when stock runs low: a minimum's worth, at least one. */
export const restockAmount = (minQuantity: number) => Math.max(1, Math.ceil(minQuantity));

/** Low stock first, then by product name. */
export const compareStock = (a: StockItem, b: StockItem) =>
  Number(b.isLow) - Number(a.isLow) || a.productName.localeCompare(b.productName);
