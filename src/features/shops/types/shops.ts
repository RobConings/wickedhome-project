import { z } from "zod";
import { SHOP_TYPES, type ShopRef, type ShopType } from "@/types/shops";
import { canManageHousehold, type HouseholdRole } from "@/types/roles";

// The types and the reference other features embed live in `@/types/shops` (contracts can't import each other).
export { SHOP_TYPES, type ShopRef, type ShopType };
export const shopTypeSchema = z.enum(SHOP_TYPES);

/** Only web links; never `javascript:` or other schemes we would render as a link. */
const websiteUrlSchema = z.url({ protocol: /^https?$/ }).max(500);

export const shopInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: shopTypeSchema,
  address: z.string().trim().max(200).optional().nullable(),
  websiteUrl: websiteUrlSchema.optional().nullable(),
  hasWebshop: z.boolean().default(false),
  openingHours: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /**
   * This household's "Use for ingredient search" (see `ingredientSearch` on `Shop`); left out = unchanged.
   * Only kept on for a shop with a webshop and a website.
   */
  ingredientSearch: z.boolean().optional(),
});
export type ShopInput = z.infer<typeof shopInputSchema>;

/**
 * The shop form as posted: a checkbox or switch is "on" or absent, and people type "colruyt.be" without
 * https://. Used by the form (browser validation) and the route action.
 */
export const shopFormSchema = shopInputSchema.extend({
  hasWebshop: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  ingredientSearch: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  websiteUrl: z.preprocess(
    (value) => (typeof value === "string" && !/^[a-z][a-z\d+.-]*:/i.test(value) ? `https://${value}` : value),
    shopInputSchema.shape.websiteUrl,
  ),
});

/** Body of `PUT /api/shops/:id/ingredient-search`: switch the shop on or off for ingredient search. */
export const shopIngredientSearchInputSchema = z.object({ enabled: z.boolean() });
export type ShopIngredientSearchInput = z.infer<typeof shopIngredientSearchInputSchema>;

/** Query string of `GET /api/shops`. */
export const shopListQuerySchema = z.object({
  type: shopTypeSchema.optional(),
  /** Case-insensitive search on the name. */
  q: z.string().trim().max(80).optional(),
});
export type ShopListQuery = z.infer<typeof shopListQuerySchema>;

export type Shop = {
  id: string;
  name: string;
  type: ShopType;
  address: string | null;
  websiteUrl: string | null;
  hasWebshop: boolean;
  openingHours: string | null;
  notes: string | null;
  /** Built-in catalogue shop (shared by every household) rather than one the household added. */
  isBuiltIn: boolean;
  /**
   * The shop's logo, found automatically on its website (`/api/shops/<id>/icon?v=<version>`), or null while
   * there is none. The version changes when the icon is refreshed, so it is safe to cache.
   */
  iconUrl: string | null;
  /**
   * This household uses the shop's webshop for ingredient search: the assistant looks there for recipe
   * ingredients it doesn't know yet. Per household (also for built-in shops); only true while the shop has a
   * webshop and a website.
   */
  ingredientSearch: boolean;
};

type Role = HouseholdRole;

/** Adults and owners add shops. Mirrors the API's role check. */
export const canAddShops = canManageHousehold;

/**
 * Own shops: adults and owners. Built-in catalogue shops: only the owner may edit them (this is a
 * single-household install) and nobody deletes them, because the seed would bring them back.
 */
export const canEditShop = (role: Role, shop: Pick<Shop, "isBuiltIn">) =>
  role === "owner" || (role === "adult" && !shop.isBuiltIn);
export const canDeleteShop = (role: Role, shop: Pick<Shop, "isBuiltIn">) => canManageHousehold(role) && !shop.isBuiltIn;

/** Only a shop with a webshop and a website can be searched for ingredients. */
export const canSearchIngredients = (shop: Pick<Shop, "hasWebshop" | "websiteUrl">) => shop.hasWebshop && Boolean(shop.websiteUrl);
/** Adults and owners choose which shops are searched (also built-in ones: the setting is the household's). */
export const canSetIngredientSearch = canManageHousehold;
