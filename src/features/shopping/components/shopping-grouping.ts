import { matchesSearch } from "@/components/shared/general-list-helpers";
import type { Shop, ShopRef } from "@/features/shops";
import { NO_SHOP, PRODUCT_CATEGORIES, type ProductCategory, type ShoppingItem } from "../types/shopping";
import { shoppingItemListIds } from "../types/shopping-product-rows";

export type ShopGroup = {
  /** A shop id, or `NO_SHOP` for items without a preferred shop. */
  key: string;
  /** The shop (from the shop list, else the item's reference): name, type and logo. */
  shop: ShopRef | null;
  name: string | null;
  open: number;
  items: ShoppingItem[];
};

/** Open items per shop: most to buy first, "no shop chosen" last. */
export function groupItemsByShop(items: ShoppingItem[], shops: Shop[]): ShopGroup[] {
  const byId = new Map(shops.map((shop) => [shop.id, shop]));
  const groups = new Map<string, ShopGroup>();
  for (const item of items) {
    const key = item.shopId ?? NO_SHOP;
    const group =
      groups.get(key) ??
      ({ key, shop: item.shopId ? (byId.get(item.shopId) ?? item.shop) : null, name: item.shop?.name ?? null, open: 0, items: [] } satisfies ShopGroup);
    group.items.push(item);
    if (item.status === "open") group.open += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.key === NO_SHOP) - Number(b.key === NO_SHOP) || b.open - a.open || (a.name ?? "").localeCompare(b.name ?? ""),
  );
}

/** Items per product category in a sensible walking order through a shop; uncategorised items last. */
export function groupItemsByCategory(items: ShoppingItem[]): { category: ProductCategory; items: ShoppingItem[] }[] {
  return PRODUCT_CATEGORIES.map((category) => ({
    category,
    items: items
      .filter((item) => (item.category ?? "other") === category)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);
}

// Shop view: priority, sort and filters -----------------------------------------------------------------

/** How urgent an item is, most urgent first: stock below minimum, at minimum, then essential, other, extras. */
export const PRIORITY_TIERS = ["urgent", "warning", "essential", "normal", "extra"] as const;
export type PriorityTier = (typeof PRIORITY_TIERS)[number];

export function priorityTier(item: Pick<ShoppingItem, "stockStatus" | "isEssential">): PriorityTier {
  if (item.stockStatus === "below_minimum") return "urgent";
  if (item.stockStatus === "at_minimum") return "warning";
  if (item.isEssential === true) return "essential";
  if (item.isEssential === false) return "extra";
  return "normal";
}

const essentialRank = (item: Pick<ShoppingItem, "isEssential">) => (item.isEssential === true ? 0 : item.isEssential === null ? 1 : 2);
const byName = (a: ShoppingItem, b: ShoppingItem) => a.name.localeCompare(b.name);

/** Most urgent first; within a tier essentials before the rest, then by name. */
export const compareByPriority = (a: ShoppingItem, b: ShoppingItem) =>
  PRIORITY_TIERS.indexOf(priorityTier(a)) - PRIORITY_TIERS.indexOf(priorityTier(b)) || essentialRank(a) - essentialRank(b) || byName(a, b);

/** Most expensive line (price × quantity) first; items without a price last. */
const compareByPrice = (a: ShoppingItem, b: ShoppingItem) => {
  if (a.priceCents === null || b.priceCents === null) return Number(a.priceCents === null) - Number(b.priceCents === null) || byName(a, b);
  return b.priceCents * b.quantity - a.priceCents * a.quantity || byName(a, b);
};

export const SHOP_VIEW_SORTS = ["priority", "category", "name", "price"] as const;
export type ShopViewSort = (typeof SHOP_VIEW_SORTS)[number];

/** Sections of the shop view: priority tiers, categories (walking order), or one unnamed group (`all`). */
export function groupShopViewItems(items: ShoppingItem[], sort: ShopViewSort): { key: string; items: ShoppingItem[] }[] {
  if (sort === "category") return groupItemsByCategory(items).map((group) => ({ key: group.category, items: group.items }));
  if (sort === "priority") {
    return PRIORITY_TIERS.map((tier) => ({
      key: tier,
      items: items.filter((item) => priorityTier(item) === tier).sort(compareByPriority),
    })).filter((group) => group.items.length > 0);
  }
  return items.length ? [{ key: "all", items: [...items].sort(sort === "price" ? compareByPrice : byName) }] : [];
}

export const SHOP_VIEW_PRIORITY_FILTERS = ["all", "essential", "extra"] as const;
/** `needed` remains accepted for existing callers; the UI uses the independent stock filter. */
export type ShopViewPriorityFilter = (typeof SHOP_VIEW_PRIORITY_FILTERS)[number] | "needed";

export type ShopViewFilters = {
  query: string;
  /** A category, or `all`. */
  category: string;
  /** A list id, or `all`. */
  listId: string;
  priority: ShopViewPriorityFilter;
  stock?: ShoppingStockFilter;
};

export const SHOPPING_STOCK_FILTERS = ["all", "low", "below_minimum", "at_minimum", "above_minimum", "untracked"] as const;
export type ShoppingStockFilter = (typeof SHOPPING_STOCK_FILTERS)[number];
export const parseStockFilter = (value: string | null): ShoppingStockFilter =>
  SHOPPING_STOCK_FILTERS.find((option) => option === value) ?? "all";
export const matchesStockFilter = (item: Pick<ShoppingItem, "stockStatus">, filter: ShoppingStockFilter = "all") =>
  filter === "all" || (filter === "low" ? item.stockStatus === "below_minimum" || item.stockStatus === "at_minimum" : filter === "untracked" ? item.stockStatus === null : item.stockStatus === filter);

export const NO_SHOP_VIEW_FILTERS: ShopViewFilters = { query: "", category: "all", listId: "all", priority: "all", stock: "all" };

const matchesPriority = (item: ShoppingItem, filter: ShopViewPriorityFilter) => {
  if (filter === "needed") return item.stockStatus === "below_minimum" || item.stockStatus === "at_minimum";
  if (filter === "essential") return item.isEssential === true;
  if (filter === "extra") return item.isEssential === false;
  return true;
};

/** Shopping overview and shop view: search name, note, list, shop and alternatives, with optional filters. */
export function filterShopViewItems(items: ShoppingItem[], filters: ShopViewFilters): ShoppingItem[] {
  return items.filter(
    (item) =>
      (filters.category === "all" || (item.category ?? "other") === filters.category) &&
      (filters.listId === "all" || shoppingItemListIds(item).includes(filters.listId)) &&
      matchesPriority(item, filters.priority) &&
      matchesStockFilter(item, filters.stock) &&
      matchesSearch([item.name, item.note, item.listName, item.shop?.name, ...item.alternatives.map((alternative) => alternative.name),
        ...(item.requirements ?? []).flatMap((part) => [part.listName, part.recipe?.name, part.project?.name, part.placeName])], filters.query),
  );
}

export const isShopViewFiltered = (filters: ShopViewFilters) =>
  filters.query.trim() !== "" || filters.category !== "all" || filters.listId !== "all" || filters.priority !== "all" || (filters.stock ?? "all") !== "all";

export const isShopKey =(key: string, item: ShoppingItem) => (key === NO_SHOP ? item.shopId === null : item.shopId === key);

/** One union of selected shops: a row is included once, without changing its shop, product or price. */
export const itemsForShops = (items: ShoppingItem[], keys: readonly string[]) => {
  const selected = new Set(keys);
  return items.filter((item) => selected.has(item.shopId ?? NO_SHOP));
};
