import { compareNeed, type NeedComparison } from "@/types/units";
import { scoreCandidates, type EntityCandidate } from "@ai/core/resolve";
import { fold } from "@ai/core/text-match";

/**
 * Matching a recipe's ingredient lines to the household's products (recipes_match, recipes_save). Pure, so it
 * is tested without a database (match.test.ts).
 *
 * - A group of alternatives (shared stock) is one candidate: its main product, with the alternatives' names as
 *   aliases, so "spek" finds "Spek" whether the household has "Delhaize spek" or "Colruyt spek".
 * - The recipe's own amount ("300 g", "2 teentjes") is compared with the stock (counted in the product's stock
 *   unit, packs) through the product's content per package (`compareNeed`): 300 g against 1 pack of 200 g is
 *   short, buy 1 pack. Units that don't convert ("2 teentjes", or no content per package) are `unknown_amount`.
 */

export type MatchProduct = {
  id: string;
  name: string;
  unit: string | null;
  stockProductId: string | null;
  packageAmount?: number | null;
  packageUnit?: string | null;
};

/** Score from which a product is taken as the ingredient (below it, only offered as "maybe"). */
const SURE = 55;

/** "400 g spaghetti", "2 teentjes look", "1 el olijfolie" → "spaghetti", "look", "olijfolie": amounts and units off. */
const LEADING_AMOUNT =
  /^\s*(?:[\d½¼¾⅓⅔.,/-]+\s*)?(?:(?:g|gr|gram|kg|kilo|mg|ml|cl|dl|l|liter|el|tl|eetlepels?|theelepels?|tbsp|tsp|cups?|oz|lb|snufje|snuifje|scheutje|handvol|teentjes?|teen|takjes?|bosje|blik(?:je)?|pak(?:je)?|stuks?|plakjes?|sneetjes?|cloves?|pinch|bunch|cans?|slices?)\b\.?\s*)?(?:(?:van|of)\s+)?/i;

export function ingredientName(line: string): string {
  const name = line.replace(LEADING_AMOUNT, "").replace(/\s*\([^)]*\)\s*/g, " ").split(",")[0]!.trim();
  return name || line.trim();
}

/** Main products with their alternatives' names as aliases. */
export function productCandidates(products: readonly MatchProduct[]): EntityCandidate[] {
  const aliases = new Map<string, string[]>();
  for (const product of products) {
    if (!product.stockProductId) continue;
    aliases.set(product.stockProductId, [...(aliases.get(product.stockProductId) ?? []), product.name]);
  }
  return products
    .filter((product) => !product.stockProductId)
    .map((product) => ({
      id: product.id,
      name: product.name,
      aliases: aliases.get(product.id) ?? [],
      data: { unit: product.unit, packageAmount: product.packageAmount ?? null, packageUnit: product.packageUnit ?? null },
    }));
}

/** "300 g", "1,5 l", "2 teentjes", "1 blik" → amount and unit; null when it doesn't start with a number. */
export function parseAmount(text: string | null | undefined): { quantity: number; unit: string | null } | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([\p{L}.]+)?/u.exec(text ?? "");
  if (!match) return null;
  const quantity = Number(match[1]!.replace(",", "."));
  return quantity > 0 ? { quantity, unit: match[2]?.replace(/\.$/, "") ?? null } : null;
}

export type IngredientMatch = {
  /** The line's name, as sent. */
  name: string;
  amount: string | null;
  /** The household's product (a group's main product), when the match is clear. */
  product: { id: string; name: string } | null;
  /** Close candidates when it isn't clear (ask, or pick one). */
  maybe: string[];
  /** In the product's stock unit (`unit`); null when it isn't kept in stock (or there is no product). */
  stock: number | null;
  /** The product's stock unit (packs). */
  unit: string | null;
  /** The recipe's amount converts to the stock unit (through the content per package). */
  comparable: boolean;
  /** Packs to buy (whole packages): 0 when the stock covers it; null when the units don't convert. */
  shortfall: number | null;
  status: NeedComparison["status"];
};

/**
 * Per ingredient line: the best product (or close candidates), its shared stock and the shortfall. `stock`
 * maps a main product's id to its total stock (absent: not kept in stock).
 */
export function matchIngredients(
  lines: readonly { name: string; amount?: string | null; quantity?: number | null; unit?: string | null }[],
  products: readonly MatchProduct[],
  stock: ReadonlyMap<string, number>,
): IngredientMatch[] {
  const candidates = productCandidates(products);
  return lines.map((line) => {
    const name = line.name.trim();
    const scored = scoreCandidates(ingredientName(name), candidates);
    const best = scored[0];
    // Clear: good enough, and exact or well ahead of the next candidate (as the entity resolver decides).
    const clear = best && best.score >= SURE && (best.score >= 100 || !scored[1] || scored[1].score < best.score - 5);
    const base = { name, amount: line.amount?.trim() || null };
    if (!best || !clear) {
      return {
        ...base,
        product: null,
        maybe: scored.slice(0, 3).map((entry) => entry.candidate.name),
        stock: null,
        unit: null,
        comparable: false,
        shortfall: null,
        status: "unknown" as const,
      };
    }
    const data = (best.candidate.data ?? {}) as { unit?: string | null; packageAmount?: number | null; packageUnit?: string | null };
    const product = { unit: data.unit ?? null, packageAmount: data.packageAmount ?? null, packageUnit: data.packageUnit ?? null };
    const total = stock.get(best.candidate.id) ?? null;
    // The recipe's own amount: given as quantity + unit, else read from the amount text ("300 g").
    const parsed = line.quantity ? { quantity: line.quantity, unit: line.unit ?? parseAmount(line.amount)?.unit ?? null } : parseAmount(line.amount);
    const need = compareNeed(parsed ?? { quantity: null, unit: null }, 1, total, product);
    return {
      ...base,
      product: { id: best.candidate.id, name: best.candidate.name },
      maybe: [],
      stock: total,
      unit: product.unit,
      comparable: need.comparable,
      shortfall: need.shortfallPackages,
      status: need.status,
    };
  });
}

/** The recipe ingredient (or extra) a spoken name means: equal first, else the best clear fuzzy match. */
export function pickByName<T extends { name: string }>(items: readonly T[], query: string): T | null {
  const wanted = fold(ingredientName(query));
  const equal = items.filter((item) => fold(item.name) === wanted);
  if (equal.length) return equal[0]!;
  const scored = scoreCandidates(
    wanted,
    items.map((item, index) => ({ id: String(index), name: item.name })),
  );
  const best = scored[0];
  if (!best || (scored[1] && scored[1].score >= best.score - 5)) return null;
  return items[Number(best.candidate.id)] ?? null;
}
