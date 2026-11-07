import type { Product, ProductShopLink, ShoppingItem } from "./shopping";

type CatalogueDetails = Pick<Product, "unit" | "defaultShopId" | "imageUrl"> & {
  shopLinks: Pick<ProductShopLink, "shopId" | "url" | "priceCents">[];
};
type ItemDetails = Pick<ShoppingItem, "unit" | "shopId" | "url" | "imageUrl" | "priceCents">;

/** Fill missing catalogue details without changing an ingredient's amount, unit, references or chosen shop. */
export function shoppingProductDetails(product: CatalogueDetails, item: ItemDetails, shopOverride?: string | null): ItemDetails {
  const shopId = shopOverride !== undefined ? shopOverride
    : item.shopId ?? product.defaultShopId ?? (product.shopLinks.length === 1 ? product.shopLinks[0]!.shopId : null);
  const link = shopId ? product.shopLinks.find((candidate) => candidate.shopId === shopId) : undefined;
  return {
    unit: item.unit ?? product.unit,
    shopId,
    url: item.url ?? link?.url ?? null,
    imageUrl: item.imageUrl ?? product.imageUrl,
    priceCents: item.priceCents ?? link?.priceCents ?? null,
  };
}
