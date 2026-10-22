import { productImageUrlSchema, type Product, type ProductCategory, type ProductInput } from "@/features/shopping/types/shopping";
import { createProduct, getProduct, updateProduct, upsertProductLink } from "@/api/shopping/shopping.service";
import type { Offer } from "./offers";

/**
 * Storing a webshop offer (offers.ts) on a product: its link and price at the shop, its photo and its content per
 * package. Copied from the offer server-side, so nothing the model retypes can be lost or garbled.
 */

/** A photo URL the product can keep (a web link the product contract accepts), else null. */
const imageOf = (offer: Offer) => (offer.imageUrl && productImageUrlSchema.safeParse(offer.imageUrl).success ? offer.imageUrl : null);

/** The product's input with the offer's photo, shop and package size filled in where the product has none. */
export function withOffer(input: ProductInput, offer: Offer): ProductInput {
  const hasPackage = Boolean(input.packageAmount && input.packageUnit);
  return {
    ...input,
    imageUrl: input.imageUrl || imageOf(offer),
    defaultShopId: input.defaultShopId || offer.shopId,
    packageAmount: hasPackage ? input.packageAmount : offer.packageAmount,
    packageUnit: hasPackage ? input.packageUnit : (offer.packageUnit as ProductInput["packageUnit"]),
  };
}

/** Sets the offer's link and price at its shop on the product. */
export async function linkOffer(householdId: string, productId: string, offer: Offer): Promise<Product> {
  return upsertProductLink(householdId, productId, { shopId: offer.shopId, url: offer.url, priceCents: offer.priceCents, articleNumber: null });
}

/** A new catalogue product made from an offer (for a recipe ingredient that has none yet), with its link. */
export async function createProductFromOffer(
  householdId: string,
  offer: Offer,
  fields: { name?: string; unit?: string | null; category?: ProductCategory } = {},
): Promise<Product> {
  const product = await createProduct(
    householdId,
    withOffer(
      { name: fields.name ?? offer.name, unit: fields.unit ?? null, category: fields.category ?? "other", defaultShopId: null, barcode: null, qrCode: null, imageUrl: null, notes: null },
      offer,
    ),
  );
  return linkOffer(householdId, product.id, offer);
}

/** An existing product gets the offer's link, and its photo and package size when it has none. */
export async function applyOfferTo(householdId: string, productId: string, offer: Offer): Promise<Product> {
  const current = await getProduct(householdId, productId);
  if (!current.imageUrl || !current.packageAmount) {
    await updateProduct(householdId, productId, withOffer(productInputOf(current), offer));
  }
  return linkOffer(householdId, productId, offer);
}

/** A product as the input that keeps everything it has. */
export function productInputOf(product: Product): ProductInput {
  return {
    name: product.name,
    unit: product.unit,
    category: product.category,
    isEssential: product.isEssential,
    defaultShopId: product.defaultShopId,
    barcode: product.barcode,
    qrCode: product.qrCode,
    imageUrl: product.imageUrl,
    notes: product.notes,
    packageAmount: product.packageAmount,
    packageUnit: product.packageUnit as ProductInput["packageUnit"],
  };
}
