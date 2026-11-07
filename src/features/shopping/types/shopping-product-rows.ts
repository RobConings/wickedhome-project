import { convertAmount, isCountUnit, normalizeUnit, toStockUnits, type StockUnitInfo } from "@/types/units";
import { formatQuantity, type ShoppingItem, type ShoppingRequirement } from "./shopping";

const round = (value: number) => Math.round(value * 1000) / 1000;
const baseline = (source: ShoppingItem["source"]) => source === "low_stock" || source === "staple";
const rank = (item: ShoppingItem) => baseline(item.source) ? 1 : 0;

/** Convert without guessing a package size or treating an unknown measure as a piece. */
export function shoppingAmount(amount: number, from: string | null, to: string | null, product?: StockUnitInfo): number | null {
  if (normalizeUnit(from) === normalizeUnit(to)) return amount;
  const direct = convertAmount(amount, from, to);
  if (direct !== null) return direct;
  if (!product) return null;
  const inStock = toStockUnits(amount, from, product);
  const targetInStock = toStockUnits(1, to, product);
  return inStock !== null && targetInStock !== null && targetInStock > 0 ? round(inStock / targetInStock) : null;
}

export const requirementOf = (item: ShoppingItem): ShoppingRequirement => ({
  id: item.id, listId: item.listId, listName: item.listName, source: item.source,
  quantity: item.quantity, unit: item.unit, taskId: item.taskId, project: item.project,
  recipe: item.recipe, placeId: item.placeId, placeName: item.placeName, note: item.note,
});

/** One open buying position per exact catalogue product, across all lists and sources.
 * Stored records remain independent requirements, retaining recipe/task/staple links and cancellation.
 * Replenishment and recurring targets are covered by deliberate purchases, never added on top of them.
 * Separate purchases in the history stay separate; one tick shares one boughtAt timestamp.
 */
export function combineShoppingItems(items: ShoppingItem[], products: ReadonlyMap<string, StockUnitInfo> = new Map(), roundPackages = true): ShoppingItem[] {
  const groups = new Map<string, ShoppingItem[]>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const key = item.productId
      ? `${item.productId}:${item.status === "open" ? "open" : item.boughtAt ?? item.id}`
      : item.id;
    const members = groups.get(key) ?? [];
    members.push(item);
    groups.set(key, members);
  }
  return [...groups.values()].map((members) => {
    const sorted = [...members].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const primary = sorted[0]!;
    const product = primary.productId ? products.get(primary.productId) : undefined;
    const requirements = [...new Map(sorted.flatMap((item) => item.requirements ?? [requirementOf(item)]).map((part) => [part.id, part])).values()];
    const hasStockUnit = product?.unit !== undefined;
    const comparable = hasStockUnit && requirements.every((part) => shoppingAmount(part.quantity, part.unit, product!.unit, product) !== null);
    const unit = comparable ? product!.unit : primary.unit;
    const needsReview = hasStockUnit && !comparable;
    if (members.length === 1 && !needsReview && unit === primary.unit) return primary;
    const amounts: { quantity: number; unit: string | null; requested: number; targets: Map<string, number> }[] = [];
    for (const part of requirements) {
      let amount: number | null = null;
      let bucket = amounts.find((candidate) => {
        amount = shoppingAmount(part.quantity, part.unit, candidate.unit, product);
        return amount !== null;
      });
      if (!bucket) {
        bucket = { quantity: 0, unit: amounts.length === 0 ? unit : part.unit, requested: 0, targets: new Map() };
        amount = shoppingAmount(part.quantity, part.unit, bucket.unit, product) ?? part.quantity;
        amounts.push(bucket);
      }
      if (baseline(part.source)) {
        // Repeated low-stock rows for the same place express the same target.
        const key = `${part.source}:${part.placeId ?? ""}`;
        bucket.targets.set(key, Math.max(bucket.targets.get(key) ?? 0, amount!));
      } else bucket.requested += amount!;
      const stockTarget = [...bucket.targets].filter(([key]) => key.startsWith("low_stock:")).reduce((sum, [, value]) => sum + value, 0);
      const stapleTarget = Math.max(0, ...[...bucket.targets].filter(([key]) => key.startsWith("staple:")).map(([, value]) => value));
      bucket.quantity = round(Math.max(bucket.requested, stockTarget, stapleTarget));
    }
    // A recipe's 250 g stays on its requirement; shopping buys one known 500 g package.
    if (roundPackages && comparable && isCountUnit(unit) && requirements.some((part) => !isCountUnit(part.unit))) {
      for (const amount of amounts) amount.quantity = Math.ceil(amount.quantity);
    }
    const notes = [...new Set(requirements.flatMap((part) => part.note ? [part.note] : []))];
    const richest = (field: "url" | "imageUrl" | "priceCents") => sorted.find((item) => item[field] !== null)?.[field] ?? null;
    const shop = sorted.find((item) => item.shopId !== null);
    const offers = sorted.filter((item) => item.shopId === (shop?.shopId ?? null));
    return {
      ...primary,
      quantity: amounts[0]?.quantity ?? primary.quantity,
      unit: amounts[0] ? amounts[0].unit : primary.unit,
      requirements,
      ...((amounts.length > 1 || needsReview) && { amounts: amounts.map(({ quantity, unit }) => ({ quantity, unit })) }),
      note: notes.join("\n") || null,
      shopId: shop?.shopId ?? null,
      shop: shop?.shop ?? null,
      // A price and URL belong to the chosen shop; never borrow a different shop's offer.
      url: offers.find((item) => item.url !== null)?.url ?? null,
      priceCents: offers.find((item) => item.priceCents !== null)?.priceCents ?? null,
      imageUrl: richest("imageUrl") as string | null,
      stockStatus: members.some((item) => item.stockStatus === "below_minimum") ? "below_minimum"
        : members.some((item) => item.stockStatus === "at_minimum") ? "at_minimum" : primary.stockStatus,
    };
  });
}

export const shoppingItemListIds = (item: ShoppingItem) => [...new Set((item.requirements ?? [item]).map((part) => part.listId))];

/** Visit selection can omit automatic contributions without changing stored recipe/minimum requirements. */
export function visitRequirements(items: ShoppingItem[], includeAutomatic: boolean, products: ReadonlyMap<string, StockUnitInfo> = new Map()): ShoppingItem[] {
  if (includeAutomatic) return items;
  return combineShoppingItems(items.flatMap((item) => (item.requirements ?? [item])
    .filter((part) => part.source !== "low_stock")
    .map((part) => ({ ...item, ...part, requirements: undefined, amounts: undefined }))), products);
}

export const shoppingItemQuantity = (item: Pick<ShoppingItem, "quantity" | "unit" | "amounts">, locale: "en" | "nl") =>
  (item.amounts ?? [item]).map(({ quantity, unit }) => `${formatQuantity(quantity, locale)}${unit ? ` ${unit}` : ""}`).join(" + ");
