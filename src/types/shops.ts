/**
 * Shop types and the shop reference other features embed. They live here (not only in the shops feature)
 * because feature contracts may not import each other: shopping items, product links and store-visit
 * events carry a `ShopRef`, so their logo shows everywhere without loading the shop list.
 */

export const SHOP_TYPES = [
  "supermarket",
  "discount",
  "diy",
  "garden",
  "home",
  "electronics",
  "pharmacy",
  "drugstore",
  "pets",
  "sports",
  "fashion",
  "online",
  "other",
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

/** A shop as other features embed it: enough for `ShopBadge` / `ShopLogo` (the logo, with the type icon as fallback). */
export type ShopRef = {
  id: string;
  name: string;
  type: ShopType;
  /** `/api/shops/<id>/icon?v=<version>`, or null while the shop has no logo. */
  iconUrl: string | null;
};
