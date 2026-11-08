import type { Product, ShoppingItem } from "./shopping";

/** Availability is a link to an actual shop, never a guess based on a product name. */
export function requirementsForDestination(items: ShoppingItem[], shopIds: readonly string[], products: readonly Product[]) {
  const selected = new Set(shopIds);
  const byProduct = new Map(products.map((product) => [product.id, product]));
  return items.filter((item) => item.shopId === null || selected.has(item.shopId) ||
    item.alternatives.some((variant) => variant.links.some((link) => selected.has(link.shop.id))) ||
    (item.productId && byProduct.get(item.productId)?.shopLinks.some((link) => selected.has(link.shop.id))));
}
