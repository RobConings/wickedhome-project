import type { SessionUser } from "@/features/auth/types/auth";
import {
  canDeleteShop,
  canEditShop,
  canSearchIngredients,
  type Shop,
  type ShopInput,
  type ShopListQuery,
  type ShopRef,
  type ShopType,
} from "@/features/shops/types/shops";
import { db, type Shop as ShopRow, type ShopType as ShopTypeRow } from "../lib/db";
import { HttpError, conflict, forbidden, notFound } from "../lib/http";
import { forgetEntity } from "../selections/selections.service";
import {
  clearShopIcon,
  fetchShopIcon,
  iconStateSelect,
  loadShopIcon,
  needsFirstIcon,
  scheduleShopIcons,
  shopIconUrl,
  type ShopIconState,
  type StoredShopIcon,
} from "./shop-icon.service";

const toType = (type: ShopTypeRow) => type.toLowerCase() as ShopType;
const fromType = (type: ShopType) => type.toUpperCase() as ShopTypeRow;

/** Shop queries select the icon's state (never its bytes) and this household's own setting for the shop. */
const withIcon = (householdId: string) =>
  ({ icon: iconStateSelect, householdSettings: { where: { householdId }, select: { ingredientSearch: true } } }) as const;
type ShopWithIcon = ShopRow & { icon: ShopIconState; householdSettings: { ingredientSearch: boolean }[] };

function toShop(row: ShopWithIcon): Shop {
  return {
    id: row.id,
    name: row.name,
    type: toType(row.type),
    address: row.address,
    websiteUrl: row.websiteUrl,
    hasWebshop: row.hasWebshop,
    openingHours: row.openingHours,
    notes: row.notes,
    isBuiltIn: row.householdId === null,
    iconUrl: shopIconUrl(row.id, row.icon),
    ingredientSearch: canSearchIngredients(row) && (row.householdSettings[0]?.ingredientSearch ?? false),
  };
}

/**
 * Prisma `select` for a shop other features embed (shopping items, product links, store visits), and its
 * mapping to the `ShopRef` contract, so the logo reaches every place a shop is shown.
 *
 *   include: { shop: { select: shopRefSelect } }   →   shop: row.shop && toShopRef(row.shop)
 */
export const shopRefSelect = { id: true, name: true, type: true, icon: iconStateSelect } as const;

export function toShopRef(row: { id: string; name: string; type: ShopTypeRow; icon: ShopIconState }): ShopRef {
  return { id: row.id, name: row.name, type: toType(row.type), iconUrl: shopIconUrl(row.id, row.icon) };
}

const toData = (input: ShopInput) => ({
  name: input.name,
  type: fromType(input.type),
  address: input.address || null,
  websiteUrl: input.websiteUrl || null,
  hasWebshop: input.hasWebshop,
  openingHours: input.openingHours || null,
  notes: input.notes || null,
});

/** The built-in catalogue plus the household's own shops. */
const visibleTo = (householdId: string) => ({ OR: [{ householdId }, { householdId: null }] });

export async function listShops(householdId: string, { type, q }: ShopListQuery = {}): Promise<Shop[]> {
  const rows = await db.shop.findMany({
    where: {
      AND: [
        visibleTo(householdId),
        type ? { type: fromType(type) } : {},
        q ? { name: { contains: q, mode: "insensitive" as const } } : {},
      ],
    },
    orderBy: { name: "asc" },
    include: withIcon(householdId),
  });
  // Shops with a website that was never tried get an icon in the background; failed ones are retried by
  // the daily `shops.icons` job (see shop-icon.service.ts).
  scheduleShopIcons(rows.filter((row) => needsFirstIcon(row)).map((row) => row.id));
  return rows.map(toShop);
}

/** Loads a shop the household can see; anything else (another household's shop) is a 404. */
async function findVisibleShop(householdId: string, id: string) {
  const row = await db.shop.findFirst({ where: { id, ...visibleTo(householdId) }, include: withIcon(householdId) });
  if (!row) throw notFound("Shop not found");
  return row;
}

export async function getShop(householdId: string, id: string): Promise<Shop> {
  const row = await findVisibleShop(householdId, id);
  if (needsFirstIcon(row)) scheduleShopIcons([row.id]);
  return toShop(row);
}

export async function createShop(householdId: string, input: ShopInput): Promise<Shop> {
  const row = await db.shop.create({ data: { householdId, ...toData(input) }, include: withIcon(householdId) });
  if (row.websiteUrl) scheduleShopIcons([row.id]);
  if (!input.ingredientSearch || !canSearchIngredients(row)) return toShop(row);
  await saveIngredientSearch(householdId, row.id, true);
  return toShop(await findVisibleShop(householdId, row.id));
}

export async function updateShop(user: SessionUser, id: string, input: ShopInput): Promise<Shop> {
  const existing = await findVisibleShop(user.householdId, id);
  if (!canEditShop(user.role, toShop(existing))) throw forbidden("Only the owner can edit built-in shops");
  const data = toData(input);
  const websiteChanged = data.websiteUrl !== existing.websiteUrl;
  if (websiteChanged) await clearShopIcon(id);
  const row = await db.shop.update({ where: { id }, data, include: withIcon(user.householdId) });
  if (websiteChanged && row.websiteUrl) scheduleShopIcons([row.id]);
  if (input.ingredientSearch === undefined) return toShop(row);
  await saveIngredientSearch(user.householdId, id, input.ingredientSearch && canSearchIngredients(row));
  return toShop(await findVisibleShop(user.householdId, id));
}

// Ingredient search ------------------------------------------------------------------------------------------

const saveIngredientSearch = (householdId: string, shopId: string, ingredientSearch: boolean) =>
  db.householdShopSetting.upsert({
    where: { householdId_shopId: { householdId, shopId } },
    create: { householdId, shopId, ingredientSearch },
    update: { ingredientSearch },
  });

/**
 * "Use for ingredient search" on or off for this household (built-in shops too: the setting is the
 * household's, not the shop's). Only a shop with a webshop and a website can be switched on.
 */
export async function setIngredientSearch(householdId: string, id: string, enabled: boolean): Promise<Shop> {
  const row = await findVisibleShop(householdId, id);
  if (enabled && !canSearchIngredients(row)) throw conflict("Only a shop with a webshop and a website can be used for ingredient search");
  await saveIngredientSearch(householdId, id, enabled);
  return toShop(await findVisibleShop(householdId, id));
}

/** `https://www.delhaize.be/nl` → `delhaize.be`; null for anything that isn't a web address. */
function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname.toLowerCase().replace(/^www\./, "") || null : null;
  } catch {
    return null;
  }
}

/**
 * The shops the assistant searches for recipe ingredients (ai/skills/recipes): switched on by this household,
 * with a webshop and a website, by name. Each with its website's domain (for a `site:` search).
 */
export async function listIngredientSearchShops(householdId: string): Promise<{ id: string; name: string; domain: string }[]> {
  const rows = await db.shop.findMany({
    where: {
      AND: [visibleTo(householdId), { hasWebshop: true, websiteUrl: { not: null } }],
      householdSettings: { some: { householdId, ingredientSearch: true } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, websiteUrl: true },
  });
  return rows.flatMap((row) => {
    const domain = domainOf(row.websiteUrl);
    return domain ? [{ id: row.id, name: row.name, domain }] : [];
  });
}

export async function deleteShop(user: SessionUser, id: string): Promise<void> {
  const shop = toShop(await findVisibleShop(user.householdId, id));
  if (shop.isBuiltIn) throw conflict("Built-in shops can't be deleted");
  if (!canDeleteShop(user.role, shop)) throw forbidden();
  await db.shop.delete({ where: { id } });
  await forgetEntity("shop", id);
}

/** The stored icon of a shop the household can see; 404 when the shop is not visible or has no icon. */
export async function getShopIcon(householdId: string, id: string): Promise<StoredShopIcon> {
  await findVisibleShop(householdId, id);
  const icon = await loadShopIcon(id);
  if (!icon) throw notFound("This shop has no icon");
  return icon;
}

/** Looks for the shop's icon again now and waits for the result. */
export async function refreshShopIcon(householdId: string, id: string): Promise<Shop> {
  const row = await findVisibleShop(householdId, id);
  if (!row.websiteUrl) throw conflict("This shop has no website");
  const result = await fetchShopIcon(id);
  if (!result.ok) throw new HttpError(422, "icon_not_found", `No icon found: ${result.reason}`);
  return toShop(await findVisibleShop(householdId, id));
}
