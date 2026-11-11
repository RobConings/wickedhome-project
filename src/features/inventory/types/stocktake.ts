import type { StockItem } from "./inventory";

export type StocktakeProduct = { id: string; name: string; stockProductId: string | null; imageUrl?: string | null };
export type StocktakeItem = StockItem & { alternativeNames: string[] };

/** A shared stock pool is counted once per location, never once per catalogue brand. */
export function stocktakeItems(items: readonly StockItem[], products: readonly StocktakeProduct[] = []): StocktakeItem[] {
  const catalogue = new Map(products.map((product) => [product.id, product]));
  const pools = new Map<string, StockItem>();
  const ownerOf = (id: string) => catalogue.get(id)?.stockProductId ?? id;
  for (const item of items) {
    const ownerId = ownerOf(item.productId);
    const key = JSON.stringify([ownerId, item.placeId]);
    const existing = pools.get(key);
    // Alias projections refer to the same stock, so never sum them. Prefer the actual owner's row.
    if (!existing || (existing.productId !== ownerId && item.productId === ownerId)) pools.set(key, item);
  }
  return [...pools.values()].map((item) => {
    const ownerId = ownerOf(item.productId);
    const owner = catalogue.get(ownerId);
    return {
      ...item,
      productId: ownerId,
      productName: owner?.name ?? item.productName,
      productImageUrl: owner?.imageUrl ?? item.productImageUrl,
      alternativeNames: products.filter((product) => product.stockProductId === ownerId).map((product) => product.name),
    };
  });
}

export const excludedFromStocktake = (item: StockItem) => Boolean(item.countExcludedUntilEmpty && item.quantity > 0);
