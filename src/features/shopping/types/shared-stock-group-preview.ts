import type { Product } from "./shopping";

type GroupProduct = Pick<Product, "id" | "name" | "stockProductId">;

/** Resolve a product and all existing alternatives to their shared stock owner. */
export function linkedGroupMembers(product: GroupProduct, products: readonly GroupProduct[]): GroupProduct[] {
  const ownerId = product.stockProductId ?? product.id;
  const owner = products.find((row) => row.id === ownerId) ?? (product.id === ownerId ? product : undefined);
  const variants = products
    .filter((row) => row.stockProductId === ownerId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...new Map([...(owner ? [owner] : []), ...variants].map((row) => [row.id, row])).values()];
}

/**
 * This previews the effect of connecting TWO linked groups. The product records and
 * their individual package sizes remain distinct; only their counted stock is shared.
 */
export function previewSharedStockLink(
  current: GroupProduct,
  selected: GroupProduct,
  products: readonly GroupProduct[],
) {
  const currentMembers = linkedGroupMembers(current, products);
  const selectedMembers = linkedGroupMembers(selected, products);
  return {
    currentMembers,
    selectedMembers,
    allMembers: [...new Map([...currentMembers, ...selectedMembers].map((row) => [row.id, row])).values()],
    needsConfirmation: currentMembers.length > 1 || selectedMembers.length > 1,
  };
}
