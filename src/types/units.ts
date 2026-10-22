/**
 * Units of amounts: recipe amounts ("300 g", "1 l", "2 teentjes"), stock units ("pack", "pcs", "g") and package
 * sizes ("200 g"). Pure, shared by the API, the UI and the assistant (units.test.ts).
 *
 * Three dimensions convert within themselves: mass (base g), volume (base ml) and count (pieces and packages;
 * every count unit is one "thing", so "2 pcs" against a stock of packs compares directly). Anything else (el,
 * tl, snuifje, teentje…) doesn't convert: callers then say "unknown amount", never a number in the wrong unit.
 */

export type UnitDimension = "mass" | "volume" | "count";

type UnitInfo = { dimension: UnitDimension; /** Base units (g, ml, 1) per one of this unit. */ factor: number };

const MASS: Record<string, number> = { mg: 0.001, g: 1, gr: 1, gram: 1, grams: 1, gramm: 1, grammes: 1, kg: 1000, kilo: 1000, kilogram: 1000, kilos: 1000 };
const VOLUME: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  cl: 10,
  centiliter: 10,
  dl: 100,
  deciliter: 100,
  l: 1000,
  lt: 1000,
  ltr: 1000,
  liter: 1000,
  litre: 1000,
  liters: 1000,
  litres: 1000,
};
const COUNT = new Set([
  "",
  "pcs",
  "pc",
  "piece",
  "pieces",
  "st",
  "stk",
  "stuk",
  "stuks",
  "x",
  "pack",
  "packs",
  "package",
  "packages",
  "pak",
  "pakje",
  "pakjes",
  "pakken",
  "verpakking",
  "verpakkingen",
  "doos",
  "doosje",
  "dozen",
  "box",
  "boxes",
  "can",
  "cans",
  "blik",
  "blikje",
  "blikjes",
  "blikken",
  "fles",
  "flesje",
  "flessen",
  "bottle",
  "bottles",
  "pot",
  "potje",
  "potten",
  "jar",
  "jars",
  "zak",
  "zakje",
  "zakjes",
  "zakken",
  "bag",
  "bags",
  "tray",
  "schaal",
  "schaaltje",
  "bakje",
  "rol",
  "rollen",
  "roll",
  "rolls",
]);

/** Lower case, no trailing dot, single spaces: "St." → "st", " KG " → "kg". */
export const normalizeUnit = (unit: string | null | undefined) =>
  (unit ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/\s+/g, " ");

/** The dimension and factor of a unit; null for units that don't convert (el, tl, teentje, snuifje…). */
export function unitInfo(unit: string | null | undefined): UnitInfo | null {
  const key = normalizeUnit(unit);
  if (key in MASS) return { dimension: "mass", factor: MASS[key]! };
  if (key in VOLUME) return { dimension: "volume", factor: VOLUME[key]! };
  if (COUNT.has(key)) return { dimension: "count", factor: 1 };
  return null;
}

/** Counted in whole things (empty, pcs, stuks, pack, pak, can…): needs in these units round up. */
export const isCountUnit = (unit: string | null | undefined) => unitInfo(unit)?.dimension === "count";

/** Converts between two units of the same dimension; null when they don't convert. */
export function convertAmount(amount: number, from: string | null | undefined, to: string | null | undefined): number | null {
  const a = unitInfo(from);
  const b = unitInfo(to);
  if (!a || !b || a.dimension !== b.dimension) return null;
  return round3((amount * a.factor) / b.factor);
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const EPSILON = 1e-9;

/** How a product's stock is counted: its stock unit and the content of one package. */
export type StockUnitInfo = {
  /** The product's stock unit ("pack", "pcs", "g"…; null = pieces/packages). */
  unit: string | null;
  packageAmount: number | null;
  packageUnit: string | null;
};

/**
 * Stock units per one of `unit`, for a product: 1 g in a product counted in packs of 200 g = 0.005. Null when
 * they don't convert.
 *
 * - The amount is in a count unit and the stock is counted in things (packs, pieces): 1 to 1.
 * - The amount and the stock unit are the same dimension (the product counts grams): a direct conversion.
 * - The amount is mass/volume and the product has a package size of that dimension: via the package size.
 */
export function stockUnitsPer(unit: string | null | undefined, product: StockUnitInfo): number | null {
  const amount = unitInfo(unit);
  const stock = unitInfo(product.unit);
  if (!amount) return null;
  if (stock && stock.dimension === amount.dimension) return amount.factor / stock.factor;
  if (amount.dimension === "count") return null;
  const pack = unitInfo(product.packageUnit);
  if (stock?.dimension === "count" && pack && pack.dimension === amount.dimension && product.packageAmount && product.packageAmount > 0) {
    return amount.factor / (pack.factor * product.packageAmount);
  }
  return null;
}

/** `amount` of `unit` in the product's stock units, or null when they don't convert. */
export function toStockUnits(amount: number, unit: string | null | undefined, product: StockUnitInfo): number | null {
  const per = stockUnitsPer(unit, product);
  return per === null ? null : round3(amount * per);
}

export type NeedComparison = {
  /** The amount needed for these servings, in the recipe's unit (count units rounded up to whole things). */
  needed: number;
  /** The same in the product's stock units (e.g. 1.5 packs); null when the units don't convert. */
  neededInStockUnits: number | null;
  /** The stock expressed in the recipe's unit (e.g. 200 g); null when it doesn't convert or isn't kept. */
  stockInRecipeUnit: number | null;
  /** What is missing in the recipe's unit; null when it can't be said. */
  shortfall: number | null;
  /** What to buy in stock units: whole packages (rounded up) when the stock counts packages; null when it can't be said. */
  shortfallPackages: number | null;
  comparable: boolean;
  /**
   * `in_stock` / `short`; `not_kept`: a product that isn't kept in stock (what to buy is still known when the
   * units convert); `unknown_amount`: the units don't convert (set the product's content per package); `unknown`:
   * no product linked.
   */
  status: "in_stock" | "short" | "not_kept" | "unknown_amount" | "unknown";
};

/**
 * Compares what an ingredient needs with the stock. `quantity`/`unit` are the recipe's own amount (300 g, 2
 * pcs; no amount = 1), multiplied by `scale` (servings). `stock` is the product's total stock in its stock
 * units, null when it isn't kept; `product` is null for a free-text ingredient.
 */
export function compareNeed(
  ingredient: { quantity: number | null; unit: string | null },
  scale: number,
  stock: number | null,
  product: StockUnitInfo | null,
): NeedComparison {
  const scaled = (ingredient.quantity ?? 1) * scale;
  const needed = roundUpWhole(scaled, ingredient.unit);
  const none = { needed, neededInStockUnits: null, stockInRecipeUnit: null, shortfall: null, shortfallPackages: null, comparable: false };
  if (!product) return { ...none, shortfall: needed, status: "unknown" };
  const per = stockUnitsPer(ingredient.unit, product);
  if (per === null) return { ...none, status: "unknown_amount" };
  const neededInStockUnits = round3(needed * per);
  const packaged = isCountUnit(product.unit) || !product.unit;
  const buy = (missingStockUnits: number) => (missingStockUnits <= EPSILON ? 0 : packaged ? Math.ceil(missingStockUnits - EPSILON) : round3(missingStockUnits));
  if (stock === null) {
    return { needed, neededInStockUnits, stockInRecipeUnit: null, shortfall: needed, shortfallPackages: buy(neededInStockUnits), comparable: true, status: "not_kept" };
  }
  const missing = Math.max(0, needed * per - stock);
  const shortfall = round3(missing / per);
  return {
    needed,
    neededInStockUnits,
    stockInRecipeUnit: round3(stock / per),
    shortfall,
    shortfallPackages: buy(missing),
    comparable: true,
    status: missing > EPSILON ? "short" : "in_stock",
  };
}

/** Count units (and the empty unit) need whole things; units that don't convert ("el") stay as scaled. */
function roundUpWhole(scaled: number, unit: string | null): number {
  if (!isCountUnit(unit)) return round3(scaled);
  return Math.max(1, Math.ceil(round3(scaled) - EPSILON));
}
