/*
 * Product alternatives: several products (brands) that share one stock
 * ─────────────────────────────────────────────────────────────────────
 * A group has one main product (`stockProductId` null) and alternatives that point at it
 * (`Product.stockProductId`). Only the main product has StockItems, so every stock path first resolves a
 * product to its stock owner. There are no chains: linking to an alternative links to its main product,
 * and a main product that becomes an alternative brings its own alternatives along.
 *
 * Linking merges the alternative's stock into the main product's, per place: quantities are summed, the
 * higher minimum and the earliest expiry are kept. Everything here is pure; the database work is in
 * shopping.service.ts (`linkAlternative`, `unlinkAlternative`, `deleteProduct`).
 */

import type { Locale } from "@/types/common";

export type GroupedProduct = { id: string; stockProductId: string | null };

/** The product whose StockItems a product uses: its main product, or itself. */
export const stockOwnerOf = (product: GroupedProduct) => product.stockProductId ?? product.id;

/** Why a link can't be made, or null. `main` is the product the user chose (it may be an alternative itself). */
export function linkProblem(product: GroupedProduct, main: GroupedProduct): "same_product" | "already_linked" | null {
  if (product.id === main.id) return "same_product";
  if (stockOwnerOf(product) === stockOwnerOf(main)) return "already_linked";
  return null;
}

export type MergeableStock = {
  id: string;
  placeId: string;
  quantity: number;
  unit: string | null;
  minQuantity: number | null;
  /** YYYY-MM-DD. */
  expiresOn: string | null;
};

/** One step of moving an alternative's stock to its main product. */
export type StockMergeStep =
  /** The main product isn't kept at this place yet: the stock item simply moves over. */
  | { kind: "move"; sourceId: string; placeId: string; quantity: number }
  /** Both are kept here: the source is added to the target (its movements move along) and then removed. */
  | {
      kind: "merge";
      sourceId: string;
      targetId: string;
      placeId: string;
      /** What the source held, logged as the merge movement's delta. */
      added: number;
      quantity: number;
      unit: string | null;
      minQuantity: number | null;
      expiresOn: string | null;
    };

const round = (value: number) => Math.round(value * 1000) / 1000;

const higher = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
const earlier = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a < b ? a : b);

/** Combines two stock items at the same place: summed quantity, higher minimum, earliest expiry. */
export function mergeStockValues(target: Omit<MergeableStock, "id" | "placeId">, source: Omit<MergeableStock, "id" | "placeId">) {
  return {
    quantity: round(target.quantity + source.quantity),
    unit: target.unit ?? source.unit,
    minQuantity: higher(target.minQuantity, source.minQuantity),
    expiresOn: earlier(target.expiresOn, source.expiresOn),
  };
}

/** What happens to each of the source's stock items when its stock joins the target's. */
export function planStockMerge(source: MergeableStock[], target: MergeableStock[]): StockMergeStep[] {
  const byPlace = new Map(target.map((item) => [item.placeId, item]));
  return source.map((item): StockMergeStep => {
    const existing = byPlace.get(item.placeId);
    if (!existing) return { kind: "move", sourceId: item.id, placeId: item.placeId, quantity: item.quantity };
    return {
      kind: "merge",
      sourceId: item.id,
      targetId: existing.id,
      placeId: item.placeId,
      added: item.quantity,
      ...mergeStockValues(existing, item),
    };
  });
}

/** Which alternative becomes the main product when the main product is deleted: the oldest, then by name. */
export function promotionCandidate<T extends { id: string; name: string; createdAt: Date }>(alternatives: T[]): T | undefined {
  return [...alternatives].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name))[0];
}

/** The note on the movement that records a merge (stored as text, in the household member's language). */
export const mergeNote = (name: string, locale: Locale) => (locale === "nl" ? `Samengevoegd uit ${name}` : `Merged from ${name}`);
