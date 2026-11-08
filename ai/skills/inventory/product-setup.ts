import type { Product } from "@/features/shopping/types/shopping";

/** Facts about what is actually stored, never a claim that unknown data was verified. */
export function productSetup(product: Product) {
  const present = {
    brand: Boolean(product.brand),
    photo: Boolean(product.imageUrl),
    shop: Boolean(product.defaultShopId),
    productLink: product.shopLinks.some((link) => Boolean(link.url)),
    specificCategory: product.category !== "other",
    stockUnit: Boolean(product.unit),
    packageSize: Boolean(product.packageAmount && product.packageUnit),
    price: product.shopLinks.some((link) => link.priceCents !== null),
    barcode: Boolean(product.barcode),
  };
  return {
    present,
    missing: Object.entries(present).filter(([, exists]) => !exists).map(([field]) => field),
    sharesStockWith: product.stockProductId,
    alternatives: product.alternatives.map(({ id, name }) => ({ id, name })),
    note: "These are stored-field checks. Missing online data is allowed: report what could not be found, never invent it. Resolve important uncertainty about identity, package/unit or shared stock with the person. Re-read after follow-up changes before confirming the final setup.",
  };
}
