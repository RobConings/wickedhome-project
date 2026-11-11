/**
 * Units of amounts: recipe amounts ("300 g", "1 l", "2 teentjes"), stock units ("pack", "pcs", "g") and package
 * sizes ("200 g"). Pure, shared by the API, the UI and the assistant (units.test.ts).
 *
 * Mass, volume and count units convert within their dimensions. Bundles (e.g. a tros/bunch) are a separate
 * dimension from individual pieces and packages. Anything else (el, tl, snuifje, teentje…) doesn't convert:
 * callers then say "unknown amount", never a number in the wrong unit.
 */

export type UnitDimension = "mass" | "volume" | "count" | "bundle";

type UnitInfo = { dimension: UnitDimension; /** Base units (g, ml, 1) per one of this unit. */ factor: number };
/** A centrally managed household unit, independent of products. */
export type UnitDefinition = { name: string; referenceUnit: string; factor: number; rounding: number; aliases: string[]; isTerminal?: boolean };

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
  "flesjes",
  "flessen",
  "bottle",
  "bottles",
  "pot",
  "potje",
  "potjes",
  "potten",
  "jar",
  "jars",
  "tube",
  "tubes",
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
const BUNDLE = new Set([
  "tros",
  "trossen",
  "bunch",
  "bunches",
]);
const PIECES = new Set(["pcs", "pc", "piece", "pieces", "st", "stk", "stuk", "stuks", "x"]);
export const isPieceUnit = (unit: string | null | undefined) => PIECES.has(normalizeUnit(unit));
/** Existing container aliases keep identifying the same centrally configured unit. Sized names stay distinct. */
export const unitDefinitionKey = (unit: string | null | undefined) => packageForm(unit) ? `container:${packageForm(unit)}` : normalizeUnit(unit);
const configuredUnit = (unit: string | null | undefined, definitions: readonly UnitDefinition[]) => definitions.find((item) => !isStandardUnitSetting(item) && [item.name, ...item.aliases].some((name) => unitDefinitionKey(name) === unitDefinitionKey(unit)));

/** Lower case, no trailing dot, single spaces: "St." → "st", " KG " → "kg". */
export const normalizeUnit = (unit: string | null | undefined) =>
  (unit ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/\s+/g, " ");

export type StandardUnit = { name: string; aliases: string[]; dimension: UnitDimension; referenceUnit: string | null; factor: number };

/** All named built-ins, grouped by spelling. Containers have no assumed content or piece count. */
export function standardUnits(): StandardUnit[] {
  const measures = (values: Record<string, number>, dimension: UnitDimension, base: string): StandardUnit[] => {
    const factors = [...new Set(Object.values(values))];
    return factors.map((factor) => {
      const [name, ...aliases] = Object.keys(values).filter((key) => values[key] === factor);
      return { name: name!, aliases, dimension, referenceUnit: name === base ? null : base, factor };
    });
  };
  const counts = new Map<string, string[]>();
  const otherAliases: Record<string, string> = {
    packs: "pack", package: "pack", packages: "pack", pak: "pack", pakje: "pack", pakjes: "pack", pakken: "pack", verpakking: "pack", verpakkingen: "pack",
    doosje: "doos", dozen: "doos", box: "doos", boxes: "doos", schaaltje: "schaal", rollen: "rol", roll: "rol", rolls: "rol",
  };
  const group = (name: string) => isPieceUnit(name) ? "stuk" : packageForm(name) ?? otherAliases[name] ?? name;
  // packageForm supplies identity keys; keep the familiar Dutch label in the overview.
  const labels: Record<string, string> = { jar: "pot", bottle: "fles", can: "blik", bag: "zak" };
  for (const name of COUNT) {
    if (!name) continue;
    const key = group(name);
    counts.set(key, [...(counts.get(key) ?? []), name]);
  }
  return [
    ...measures(MASS, "mass", "g"), ...measures(VOLUME, "volume", "ml"),
    ...[...counts].map(([key, names]) => {
      const name = labels[key] ?? key;
      return { name, aliases: names.filter((alias) => alias !== name), dimension: "count" as const, referenceUnit: null, factor: 1 };
    }),
    { name: "tros", aliases: [...BUNDLE].filter((name) => name !== "tros"), dimension: "bundle", referenceUnit: null, factor: 1 },
  ];
}

const standardByName = new Map(standardUnits().flatMap((unit) => [unit.name, ...unit.aliases].map((name) => [unitDefinitionKey(name), unit] as const)));

/** Settings for a built-in cannot change its meaning, factor, reference, aliases or rounding. */
export function standardUnitSetting(name: string, isTerminal: boolean): UnitDefinition | null {
  const standard = standardByName.get(unitDefinitionKey(name));
  return standard ? { name: standard.name, referenceUnit: standard.referenceUnit ?? standard.name, factor: standard.factor, rounding: standard.dimension === "count" || standard.dimension === "bundle" ? 1 : 0.001, aliases: [], isTerminal } : null;
}

export function isStandardUnitSetting(unit: UnitDefinition): boolean {
  if (typeof unit.isTerminal !== "boolean") return false;
  const expected = standardUnitSetting(unit.name, unit.isTerminal);
  return Boolean(expected && unit.name === expected.name && unit.referenceUnit === expected.referenceUnit && unit.factor === expected.factor && unit.rounding === expected.rounding && unit.aliases.length === 0);
}

export type UnitNode = { name: string; aliases: string[]; referenceUnit: string | null; factor: number; rounding: number; dimension: UnitDimension | null; source: "standard" | "custom"; needsDefinition: boolean; isTerminal: boolean };

/** The same canonical nodes serve conversion checks, the overview and MCP relationship paths. */
export function unitNodes(definitions: readonly UnitDefinition[]): UnitNode[] {
  const custom = definitions.filter((unit) => !isStandardUnitSetting(unit));
  const settings = new Map(definitions.filter(isStandardUnitSetting).map((unit) => [unit.name, unit.isTerminal === true]));
  const customKeys = new Set(custom.flatMap((unit) => [unit.name, ...unit.aliases].map(unitDefinitionKey)));
  const builtins = standardUnits().flatMap((unit): UnitNode[] => {
    const names = [unit.name, ...unit.aliases].filter((name) => !customKeys.has(unitDefinitionKey(name)));
    return names.length ? [{ ...unit, name: names[0]!, aliases: names.slice(1), rounding: unit.dimension === "count" || unit.dimension === "bundle" ? 1 : 0.001, source: "standard", needsDefinition: unit.dimension === "count" && !isPieceUnit(unit.name), isTerminal: settings.get(unit.name) ?? false }] : [];
  });
  const byName = new Map(custom.flatMap((unit) => [unit.name, ...unit.aliases].map((name) => [unitDefinitionKey(name), unit] as const)));
  const info = new Map<string, UnitInfo | null>();
  const resolve = (name: string, seen = new Set<string>()): UnitInfo | null => {
    const target = byName.get(unitDefinitionKey(name));
    if (!target) return unitInfo(name);
    if (seen.has(target.name)) return null;
    if (info.has(target.name)) return info.get(target.name)!;
    const reference = resolve(target.referenceUnit, new Set([...seen, target.name]));
    const factor = reference ? reference.factor * target.factor : 0;
    const result = reference && Number.isFinite(factor) && factor > 0 ? { dimension: reference.dimension, factor } : null;
    info.set(target.name, result);
    return result;
  };
  return [...builtins, ...custom.map((unit): UnitNode => ({ ...unit, dimension: resolve(unit.name)?.dimension ?? null, source: "custom", needsDefinition: false, isTerminal: unit.isTerminal === true }))];
}

export type UnitConnection = { unit: UnitNode; factor: number; path: string[]; direct: boolean };

/** A terminal node may be an endpoint, but must never be an interior node of a conversion path. */
export function unitConnections(name: string, definitions: readonly UnitDefinition[], options: { ignoreTerminals?: boolean; implicitCounts?: boolean } = {}): { unit: UnitNode; links: UnitConnection[] } | null {
  const items = unitNodes(definitions);
  const byName = new Map(items.flatMap((unit) => [unit.name, ...unit.aliases].map((name) => [unitDefinitionKey(name), unit] as const)));
  const unit = byName.get(unitDefinitionKey(name || "stuk"));
  if (!unit) return null;
  const chain = (start: UnitNode) => {
    const path: string[] = [];
    let current: UnitNode | undefined = start;
    let factor = 1;
    while (current) {
      if (path.includes(current.name)) return null;
      path.push(current.name);
      const reference = current.referenceUnit ?? (options.implicitCounts && current.source === "standard" && current.dimension === "count" && !isPieceUnit(current.name) ? "stuk" : null);
      if (!reference) return { path, factor, root: current.name };
      factor *= current.factor;
      if (!Number.isFinite(factor) || factor <= 0) return null;
      current = byName.get(unitDefinitionKey(reference));
    }
    return null;
  };
  const source = chain(unit);
  const links = items.flatMap((target): UnitConnection[] => {
    if (!source || target.name === unit.name) return [];
    const destination = chain(target);
    if (!destination || destination.root !== source.root) return [];
    const factor = source.factor / destination.factor;
    if (!Number.isFinite(factor) || factor <= 0) return [];
    const common = source.path.findIndex((name) => destination.path.includes(name));
    const path = [...source.path.slice(0, common + 1), ...destination.path.slice(0, destination.path.indexOf(source.path[common]!)).reverse()];
    if (!options.ignoreTerminals && path.slice(1, -1).some((name) => byName.get(unitDefinitionKey(name))?.isTerminal)) return [];
    return [{ unit: target, factor, path, direct: path.length === 2 }];
  });
  return { unit, links };
}

const sameUnitNode = (a: string | null | undefined, b: string | null | undefined, definitions: readonly UnitDefinition[]) => {
  const nodes = unitNodes(definitions);
  const find = (name: string | null | undefined) => nodes.find((unit) => [unit.name, ...unit.aliases].some((alias) => unitDefinitionKey(alias) === unitDefinitionKey(name || "stuk")));
  const first = find(a);
  return Boolean(first && first.name === find(b)?.name);
};

export function terminalBlocksConversion(from: string | null | undefined, to: string | null | undefined, definitions: readonly UnitDefinition[]) {
  if (!definitions.some((unit) => unit.isTerminal)) return false;
  const result = unitConnections(from || "stuk", definitions, { ignoreTerminals: true, implicitCounts: true });
  const target = result?.links.find((link) => [link.unit.name, ...link.unit.aliases].some((name) => unitDefinitionKey(name) === unitDefinitionKey(to || "stuk")));
  const terminals = new Set(unitNodes(definitions).filter((unit) => unit.isTerminal).map((unit) => unit.name));
  return target?.path.slice(1, -1).some((name) => terminals.has(name)) ?? false;
}

/** Container aliases describe a physical variant; a jar is never silently a tube or bottle. */
export function packageForm(unit: string | null | undefined): string | null {
  const key = normalizeUnit(unit);
  for (const [form, names] of Object.entries({
    jar: ["pot", "potje", "potjes", "potten", "jar", "jars"],
    tube: ["tube", "tubes"],
    bottle: ["fles", "flesje", "flesjes", "flessen", "bottle", "bottles"],
    can: ["blik", "blikje", "blikjes", "blikken", "can", "cans"],
    bag: ["zak", "zakje", "zakjes", "zakken", "bag", "bags"],
  })) if (names.includes(key)) return form;
  return null;
}

export const incompatiblePackages = (a: string | null | undefined, b: string | null | undefined) => {
  const first = packageForm(a); const second = packageForm(b);
  return Boolean(first && second && first !== second);
};

/** The dimension and factor of a unit; null for units that don't convert (el, tl, teentje, snuifje…). */
export function unitInfo(unit: string | null | undefined, definitions: readonly UnitDefinition[] = [], seen = new Set<string>()): UnitInfo | null {
  const key = normalizeUnit(unit);
  const custom = configuredUnit(unit, definitions);
  if (custom) {
    if (seen.has(custom.name)) return null;
    const reference = unitInfo(custom.referenceUnit, definitions, new Set([...seen, custom.name]));
    const factor = reference ? reference.factor * custom.factor : 0;
    return reference && Number.isFinite(factor) && factor > 0 ? { dimension: reference.dimension, factor } : null;
  }
  if (key in MASS) return { dimension: "mass", factor: MASS[key]! };
  if (key in VOLUME) return { dimension: "volume", factor: VOLUME[key]! };
  if (COUNT.has(key)) return { dimension: "count", factor: 1 };
  if (BUNDLE.has(key)) return { dimension: "bundle", factor: 1 };
  return null;
}

/** Counted in whole things (empty, pcs, stuks, pack, pak, can…): needs in these units round up. */
export const isCountUnit = (unit: string | null | undefined, definitions: readonly UnitDefinition[] = []) => ["count", "bundle"].includes(unitInfo(unit, definitions)?.dimension ?? "");

export const unitRounding = (unit: string | null | undefined, definitions: readonly UnitDefinition[] = []) =>
  configuredUnit(unit, definitions)?.rounding ?? (isCountUnit(unit, definitions) ? 1 : 0.001);

/** Converts between two units of the same dimension; null when they don't convert. */
export function convertAmount(amount: number, from: string | null | undefined, to: string | null | undefined, definitions: readonly UnitDefinition[] = []): number | null {
  if (terminalBlocksConversion(from, to, definitions)) return null;
  if (incompatiblePackages(from, to) && !(configuredUnit(from, definitions) && configuredUnit(to, definitions))) return null;
  const a = unitInfo(from, definitions);
  const b = unitInfo(to, definitions);
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
  /** Conversion catalogue supplied by the household, never stored on this product. */
  units?: UnitDefinition[];
};

/**
 * Stock units per one of `unit`, for a product: 1 g in a product counted in packs of 200 g = 0.005. Null when
 * they don't convert.
 *
 * - Individual pieces and containers differ: pieces per bag require a known piece count per bag.
 * - Matching count units (pieces to pieces, bottles to bottles) compare directly.
 * - The amount and the stock unit are the same dimension (the product counts grams): a direct conversion.
 * - The amount is mass/volume and the product has a package size of that dimension: via the package size.
 */
export function stockUnitsPer(unit: string | null | undefined, product: StockUnitInfo): number | null {
  const definitions = product.units ?? [];
  if (terminalBlocksConversion(unit, product.unit, definitions)) return null;
  if (incompatiblePackages(unit, product.unit) && !(configuredUnit(unit, definitions) && configuredUnit(product.unit, definitions))) return null;
  const amount = unitInfo(unit, definitions);
  const stock = unitInfo(product.unit, definitions);
  if (!amount) return null;
  if (stock && stock.dimension === amount.dimension && (configuredUnit(unit, definitions) || configuredUnit(product.unit, definitions))) return amount.factor / stock.factor;
  if (amount.dimension === "count" && stock?.dimension === "count") {
    const fromPiece = PIECES.has(normalizeUnit(unit));
    const toPiece = PIECES.has(normalizeUnit(product.unit));
    const fromContainer = COUNT.has(normalizeUnit(unit)) && !fromPiece && Boolean(normalizeUnit(unit));
    const toContainer = COUNT.has(normalizeUnit(product.unit)) && !toPiece && Boolean(normalizeUnit(product.unit));
    if (fromPiece && toContainer) {
      return PIECES.has(normalizeUnit(product.packageUnit)) && product.packageAmount && product.packageAmount > 0
        ? 1 / product.packageAmount : null;
    }
    if (fromContainer && toPiece) return null;
  }
  if (stock && stock.dimension === amount.dimension) return amount.factor / stock.factor;
  if (amount.dimension === "count") return null;
  const pack = unitInfo(product.packageUnit, definitions);
  if (stock?.dimension === "count" && pack && pack.dimension === amount.dimension && product.packageAmount && product.packageAmount > 0) {
    if (terminalBlocksConversion(unit, product.packageUnit, definitions)) return null;
    const terminalContent = unitNodes(definitions).find((item) => item.isTerminal && [item.name, ...item.aliases].some((name) => unitDefinitionKey(name) === unitDefinitionKey(product.packageUnit)));
    if (terminalContent && !sameUnitNode(unit, product.packageUnit, definitions) && !sameUnitNode(product.unit, product.packageUnit, definitions)) return null;
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
  const needed = roundUpWhole(scaled, ingredient.unit, product?.units);
  const none = { needed, neededInStockUnits: null, stockInRecipeUnit: null, shortfall: null, shortfallPackages: null, comparable: false };
  if (!product) return { ...none, shortfall: needed, status: "unknown" };
  const per = stockUnitsPer(ingredient.unit, product);
  if (per === null) return stock === 0
    ? { ...none, stockInRecipeUnit: 0, shortfall: needed, status: "short" }
    : { ...none, status: "unknown_amount" };
  const neededInStockUnits = round3(needed * per);
  const increment = unitRounding(product.unit, product.units);
  const buy = (missingStockUnits: number) => (missingStockUnits <= EPSILON ? 0 : round3(Math.ceil(missingStockUnits / increment - EPSILON) * increment));
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
function roundUpWhole(scaled: number, unit: string | null, definitions: readonly UnitDefinition[] = []): number {
  if (!isCountUnit(unit, definitions)) return round3(scaled);
  return Math.max(1, Math.ceil(round3(scaled) - EPSILON));
}

/** Use the household's one known stock unit as the default for a new count.
 * This chooses a label; it never converts explicit recipe or purchase amounts.
 * No package weight is required to count jars, bottles or pieces.
 */
export function householdStockUnit(catalogueUnit: string | null, stock: readonly { unit: string | null }[] = []): string | null {
  const units = new Map(stock.filter(({ unit }) => typeof unit === "string" && unit.trim() !== "").map(({ unit }) => [normalizeUnit(unit), unit]));
  return units.size === 1 ? units.values().next().value! : catalogueUnit;
}
