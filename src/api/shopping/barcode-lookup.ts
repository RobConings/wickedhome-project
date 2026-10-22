import type { PackageQuantity, ProductSuggestion } from "@/features/shopping/types/barcode-lookup";
import { barcodeImagePath, packageSizeOf } from "@/features/shopping/types/barcode-lookup";
import type { ProductCategory } from "@/features/shopping/types/shopping";
import type { Locale } from "@/types/common";

/*
 * Barcode auto-fill: asking the public product databases and mapping their answer
 * ─────────────────────────────────────────────────────────────────────────────
 * Sources (server-side only, never named in the UI; credit in docs/INVENTORY.md): the Open Food Facts
 * family — food, beauty, pet food and other products — read with their v3 product API. They share one
 * product index: the food site answers "found with a different product type" for a shampoo or a dish
 * soap, so a lookup asks the food site first and then, only when told so, the site of that type. A code
 * no site knows costs one read; a non-food product two.
 *
 * Everything in this file is pure (no database, no network of its own) so it can be unit-tested with
 * hand-made sample answers; caching, rate limits and images live in barcode-lookup.service.ts.
 */

// Sources ------------------------------------------------------------------------------------------------

export type SourceKind = "food" | "beauty" | "petfood" | "product";

type Source = { kind: SourceKind; apiHost: string; imageHosts: readonly string[] };

export const SOURCES: Record<SourceKind, Source> = {
  food: { kind: "food", apiHost: "world.openfoodfacts.org", imageHosts: ["images.openfoodfacts.org", "static.openfoodfacts.org"] },
  beauty: { kind: "beauty", apiHost: "world.openbeautyfacts.org", imageHosts: ["images.openbeautyfacts.org", "static.openbeautyfacts.org"] },
  petfood: { kind: "petfood", apiHost: "world.openpetfoodfacts.org", imageHosts: ["images.openpetfoodfacts.org", "static.openpetfoodfacts.org"] },
  product: { kind: "product", apiHost: "world.openproductsfacts.org", imageHosts: ["images.openproductsfacts.org", "static.openproductsfacts.org"] },
};

export const SOURCE_API_HOSTS = Object.values(SOURCES).map((source) => source.apiHost);
export const SOURCE_IMAGE_HOSTS = Object.values(SOURCES).flatMap((source) => source.imageHosts);

const isSourceKind = (value: unknown): value is SourceKind => typeof value === "string" && value in SOURCES;

const NAME_LANGUAGES = ["nl", "fr", "en"] as const;
type NameLanguage = (typeof NAME_LANGUAGES)[number];

/** Only what the mapping needs; keeps answers small. */
export const SOURCE_FIELDS = [
  "code",
  "lang",
  "product_type",
  "product_name",
  ...NAME_LANGUAGES.map((lang) => `product_name_${lang}`),
  "generic_name",
  ...NAME_LANGUAGES.map((lang) => `generic_name_${lang}`),
  "brands",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "categories_tags",
  "image_front_url",
  "image_url",
].join(",");

export const sourceProductUrl = (kind: SourceKind, code: string) =>
  `https://${SOURCES[kind].apiHost}/api/v3/product/${code}?fields=${SOURCE_FIELDS}`;

/** How one site answered. Throws on an answer that isn't a v3 product answer at all. */
export type SourceAnswer =
  | { kind: "found"; product: Record<string, unknown>; productType: SourceKind }
  | { kind: "other_type"; productType: SourceKind }
  | { kind: "not_found" };

export function readSourceAnswer(json: unknown, askedKind: SourceKind): SourceAnswer {
  if (!json || typeof json !== "object") throw new Error("Not a product answer");
  const answer = json as { status?: unknown; result?: { id?: unknown }; product?: unknown; errors?: unknown };
  const resultId = typeof answer.result?.id === "string" ? answer.result.id : null;
  if (answer.product && typeof answer.product === "object" && (resultId === "product_found" || String(answer.status).startsWith("success"))) {
    const product = answer.product as Record<string, unknown>;
    return { kind: "found", product, productType: isSourceKind(product.product_type) ? product.product_type : askedKind };
  }
  if (resultId === "product_found_with_a_different_product_type") {
    const errors = Array.isArray(answer.errors) ? (answer.errors as { field?: { id?: unknown; value?: unknown } }[]) : [];
    const type = errors.find((error) => error.field?.id === "product_type")?.field?.value;
    if (isSourceKind(type) && type !== askedKind) return { kind: "other_type", productType: type };
    return { kind: "not_found" };
  }
  if (resultId === "product_not_found" || resultId === "invalid_code" || answer.status === "failure") return { kind: "not_found" };
  throw new Error("Not a product answer");
}

/**
 * Asks the food site, then (when it says so) the site of the product's type. `fetchJson` resolves with the
 * parsed body, also for a 404 (which carries the reason); it throws when a site can't be reached.
 */
export async function askSources(
  code: string,
  fetchJson: (kind: SourceKind, url: string) => Promise<unknown>,
): Promise<{ product: Record<string, unknown>; productType: SourceKind } | null> {
  let kind: SourceKind = "food";
  for (let hop = 0; hop < 2; hop += 1) {
    const answer = readSourceAnswer(await fetchJson(kind, sourceProductUrl(kind, code)), kind);
    if (answer.kind === "found") return { product: answer.product, productType: answer.productType };
    if (answer.kind === "not_found") return null;
    kind = answer.productType;
  }
  return null;
}

// The stored record --------------------------------------------------------------------------------------

/**
 * What the cache keeps for a found code (`BarcodeLookup.data`): source-neutral, raw enough that the
 * per-request choices (name language, number format) and mapping rules can still change.
 */
export type LookupRecord = {
  names: Partial<Record<NameLanguage | "default", string>>;
  genericNames: Partial<Record<NameLanguage | "default", string>>;
  brand: string | null;
  quantity: string | null;
  productQuantity: number | null;
  productQuantityUnit: string | null;
  categoryTags: string[];
  productType: SourceKind;
  /** Where the photo can be downloaded (an allowed image host), never sent to the browser. */
  imageSourceUrl: string | null;
};

const text = (value: unknown, max = 200): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
};

const imageUrlOn = (value: unknown, hosts: readonly string[]): string | null => {
  const raw = text(value, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && hosts.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Maps a found product (v3 `product` object) to the record the cache keeps. */
export function toLookupRecord(product: Record<string, unknown>, productType: SourceKind): LookupRecord {
  const names: LookupRecord["names"] = {};
  const genericNames: LookupRecord["genericNames"] = {};
  for (const lang of NAME_LANGUAGES) {
    const name = text(product[`product_name_${lang}`], 120);
    if (name) names[lang] = name;
    const generic = text(product[`generic_name_${lang}`], 120);
    if (generic) genericNames[lang] = generic;
  }
  const main = text(product.product_name, 120);
  const mainGeneric = text(product.generic_name, 120);
  const lang = typeof product.lang === "string" ? product.lang : null;
  if (main) names.default = main;
  if (mainGeneric) genericNames.default = mainGeneric;
  // `product_name` is in the product's main language; fill that language in when it has no own field.
  if (lang && (NAME_LANGUAGES as readonly string[]).includes(lang)) {
    const key = lang as NameLanguage;
    if (main && !names[key]) names[key] = main;
    if (mainGeneric && !genericNames[key]) genericNames[key] = mainGeneric;
  }
  const amount = Number(product.product_quantity);
  const hosts = SOURCES[productType].imageHosts;
  return {
    names,
    genericNames,
    brand: text(product.brands, 200),
    quantity: text(product.quantity, 60),
    productQuantity: Number.isFinite(amount) && amount > 0 ? amount : null,
    productQuantityUnit: text(product.product_quantity_unit, 10),
    categoryTags: Array.isArray(product.categories_tags)
      ? product.categories_tags.flatMap((tag) => (typeof tag === "string" ? [tag.toLowerCase().slice(0, 80)] : [])).slice(0, 40)
      : [],
    productType,
    imageSourceUrl: imageUrlOn(product.image_front_url, hosts) ?? imageUrlOn(product.image_url, hosts),
  };
}

/** True when the record has something worth suggesting (a code with an empty entry counts as a miss). */
export const isUsableRecord = (record: LookupRecord) => Object.keys(record.names).length > 0 || Object.keys(record.genericNames).length > 0;

// Cache freshness ----------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
/** A found product is reused this long before it is asked again. */
export const HIT_TTL_MS = 90 * DAY_MS;
/** A code nobody knew is asked again after this long (products get added all the time). */
export const MISS_TTL_MS = 7 * DAY_MS;

export function isFreshLookup(row: { found: boolean; fetchedAt: Date }, now = Date.now()): boolean {
  return now - row.fetchedAt.getTime() < (row.found ? HIT_TTL_MS : MISS_TTL_MS);
}

// Names --------------------------------------------------------------------------------------------------

/** The user's language first, then Dutch, French, English, then the name in the product's main language. */
export function nameLanguages(locale: Locale): (NameLanguage | "default")[] {
  return [...new Set<NameLanguage | "default">([locale, ...NAME_LANGUAGES, "default"])];
}

export function pickName(names: LookupRecord["names"], locale: Locale): string | null {
  for (const lang of nameLanguages(locale)) {
    const name = names[lang];
    if (name) return name;
  }
  return null;
}

const LEGAL_FORMS = /[\s,]+(?:s\.?a\.?\/n\.?v\.?|n\.?v\.?\/s\.?a\.?|s\.?a\.?|n\.?v\.?|b\.?v\.?|bvba|gmbh(?: & co\.? ?kg)?|ltd\.?|inc\.?|sas|srl|ag|plc)$/i;

/**
 * The first brand, without a legal form, in Title Case when it was all capitals or all lowercase
 * ("COCA-COLA SERVICES SA/NV" → "Coca-Cola Services", "syoss men" → "Syoss Men").
 */
export function tidyBrand(brands: string | null): string | null {
  const first = brands?.split(",")[0]?.trim();
  if (!first) return null;
  let brand = first;
  for (let pass = 0; pass < 2; pass += 1) brand = brand.replace(LEGAL_FORMS, "").trim();
  const oneCase = brand === brand.toUpperCase() || brand === brand.toLowerCase();
  if (brand.length > 3 && oneCase && /\p{L}/u.test(brand)) {
    brand = brand.toLowerCase().replace(/(^|[\s\-/&.'])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toUpperCase());
  }
  return brand.slice(0, 60) || null;
}

const comparable = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** "Coca-Cola" + "Original" + "1,5 l" → "Coca-Cola Original 1,5 l"; the brand and size only when not in the name yet. */
export function composeProductName(name: string, brand: string | null, quantity: PackageQuantity | null): string {
  let result = name;
  const brandWord = brand ? comparable(brand).split(" ")[0] : "";
  if (brand && brandWord && !` ${comparable(name)} `.includes(` ${brandWord} `)) result = `${brand} ${result}`;
  const hasSize = /\d\s*(?:x\s*\d+\s*)?(?:kg|g|gr|mg|l|cl|ml|dl|ltr|liter|litre|pcs|st|stuks)\b/i.test(name);
  if (quantity && !hasSize) result = `${result} ${quantity.text}`;
  return result.slice(0, 120).trim();
}

// Quantities ---------------------------------------------------------------------------------------------

/** Units on packaging → the app's units, with a factor to convert the amount. */
const UNITS: Record<string, { unit: string; factor: number }> = {
  kg: { unit: "kg", factor: 1 },
  kilo: { unit: "kg", factor: 1 },
  g: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  gram: { unit: "g", factor: 1 },
  grammes: { unit: "g", factor: 1 },
  mg: { unit: "g", factor: 0.001 },
  l: { unit: "l", factor: 1 },
  lt: { unit: "l", factor: 1 },
  ltr: { unit: "l", factor: 1 },
  liter: { unit: "l", factor: 1 },
  litre: { unit: "l", factor: 1 },
  dl: { unit: "cl", factor: 10 },
  cl: { unit: "cl", factor: 1 },
  ml: { unit: "ml", factor: 1 },
  pcs: { unit: "pcs", factor: 1 },
  pc: { unit: "pcs", factor: 1 },
  st: { unit: "pcs", factor: 1 },
  stuk: { unit: "pcs", factor: 1 },
  stuks: { unit: "pcs", factor: 1 },
  pieces: { unit: "pcs", factor: 1 },
  pièces: { unit: "pcs", factor: 1 },
  tabs: { unit: "pcs", factor: 1 },
  capsules: { unit: "pcs", factor: 1 },
  rolls: { unit: "pcs", factor: 1 },
  rollen: { unit: "pcs", factor: 1 },
  rouleaux: { unit: "pcs", factor: 1 },
};

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`([a-zè]+\.?)`;
const MULTI = new RegExp(String.raw`(\d+)\s*[x×*]\s*${NUMBER}\s*${UNIT}`, "iu");
const MULTI_AFTER = new RegExp(String.raw`${NUMBER}\s*${UNIT}\s*[x×*]\s*(\d+)\b`, "iu");
const SINGLE = new RegExp(String.raw`${NUMBER}\s*${UNIT}`, "giu");

const toNumber = (value: string) => Number(value.replace(",", "."));
const unitOf = (raw: string) => UNITS[raw.toLowerCase().replace(/\.$/, "")] ?? null;
const roundAmount = (value: number) => Math.round(value * 1000) / 1000;

export function formatAmount(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE", { maximumFractionDigits: 3, useGrouping: false }).format(amount);
}

function build(count: number, amount: number, unit: string, locale: Locale): PackageQuantity {
  const each = `${formatAmount(amount, locale)} ${unit}`;
  return { text: count > 1 ? `${count} x ${each}` : each, amount, unit, count };
}

/**
 * Reads a package size as printed: "1,5 l", "1.5L", "500 g", "6 x 33 cl", "33cl x 6", "2,5 kg",
 * "40g (20 pellets)", "Net wt 16 oz (454 g)". Falls back to the separate amount + unit fields, then to the
 * text as it is (amount null). Null when there is nothing at all.
 */
export function parsePackageQuantity(
  raw: string | null,
  locale: Locale,
  fallback: { amount: number | null; unit: string | null } = { amount: null, unit: null },
): PackageQuantity | null {
  const value = raw?.replace(/\s+/g, " ").trim() ?? "";
  if (value) {
    const multi = value.match(MULTI);
    if (multi) {
      const unit = unitOf(multi[3] ?? "");
      const count = Number(multi[1]);
      if (unit && count > 1 && count <= 1000) return build(count, roundAmount(toNumber(multi[2] ?? "") * unit.factor), unit.unit, locale);
    }
    const after = value.match(MULTI_AFTER);
    if (after) {
      const unit = unitOf(after[2] ?? "");
      const count = Number(after[3]);
      if (unit && count > 1 && count <= 1000) return build(count, roundAmount(toNumber(after[1] ?? "") * unit.factor), unit.unit, locale);
    }
    // The first amount with a unit we know ("16 oz (454 g)" skips the ounces).
    for (const match of value.matchAll(SINGLE)) {
      const unit = unitOf(match[2] ?? "");
      const amount = toNumber(match[1] ?? "");
      if (unit && amount > 0) return build(1, roundAmount(amount * unit.factor), unit.unit, locale);
    }
  }
  const unit = fallback.unit ? unitOf(fallback.unit) : null;
  if (fallback.amount && unit) return build(1, roundAmount(fallback.amount * unit.factor), unit.unit, locale);
  return value ? { text: value.slice(0, 40), amount: null, unit: null, count: 1 } : null;
}

/**
 * The content of one package read from a product's name ("BONI franse emmental geraspt 200 g" → 200 g, "Cola 6 x
 * 33 cl" → 198 cl), for filling in missing package sizes (scripts/backfill-package-sizes.ts). Null when the name
 * has no amount with a known unit.
 */
export function packageSizeFromName(name: string): { amount: number; unit: string } | null {
  return packageSizeOf(parsePackageQuantity(name, "en"));
}

// Categories ---------------------------------------------------------------------------------------------

/** First matching rule wins, so the order matters (frozen pizza is frozen, milk is dairy before drinks). */
const CATEGORY_RULES: [ProductCategory, string[]][] = [
  ["frozen", ["en:frozen-foods", "en:frozen-desserts", "en:ice-creams-and-sorbets", "en:ice-creams"]],
  ["baby", ["en:baby-foods", "en:baby-milks", "en:infant-formulas", "en:baby-cereals"]],
  ["pharmacy", ["en:food-supplements", "en:dietary-supplements", "en:vitamins"]],
  ["dairy", ["en:dairies", "en:milks", "en:cheeses", "en:yogurts", "en:butters", "en:eggs", "en:creams", "en:dairy-desserts"]],
  ["meat_fish", ["en:meats", "en:prepared-meats", "en:poultries", "en:fishes", "en:seafood", "en:fish-and-meat-and-eggs"]],
  ["bakery", ["en:breads", "en:viennoiseries", "en:pastries", "en:sandwich-breads"]],
  ["produce", ["en:fresh-vegetables", "en:fresh-fruits", "en:fresh-herbs", "en:fresh-plant-based-foods", "en:mushrooms"]],
  // Coffee and tea live on the breakfast shelf, not with the drinks.
  ["pantry", ["en:coffees", "en:teas", "en:hot-beverages", "en:cocoa-and-its-products"]],
  ["drinks", ["en:beverages", "en:waters", "en:sodas", "en:alcoholic-beverages", "en:juices-and-nectars", "en:plant-based-beverages"]],
  [
    "pantry",
    [
      "en:snacks",
      "en:spreads",
      "en:sweet-spreads",
      "en:breakfasts",
      "en:cereals-and-potatoes",
      "en:cereals-and-their-products",
      "en:pastas",
      "en:rices",
      "en:condiments",
      "en:sauces",
      "en:groceries",
      "en:canned-foods",
      "en:biscuits-and-cakes",
      "en:confectioneries",
      "en:chocolates",
      "en:fats",
      "en:vegetable-oils",
      "en:sweeteners",
      "en:meals",
      "en:soups",
    ],
  ],
];

const HOUSEHOLD_TAGS = ["en:cleaning", "en:household", "en:dishwashing", "en:laundry", "en:detergents", "en:non-food-products"];

/** The app's category for a product, from its type and category tags; null when nothing fits. */
export function mapCategory(tags: readonly string[], productType: SourceKind): ProductCategory | null {
  if (productType === "beauty") return tags.some((tag) => tag.startsWith("en:baby")) ? "baby" : "personal_care";
  if (productType === "petfood") return "pets";
  const set = new Set(tags.map((tag) => tag.toLowerCase()));
  if (productType === "product") {
    if (HOUSEHOLD_TAGS.some((tag) => set.has(tag)) || tags.some((tag) => /clean|deterg|dishwash|laundry|vaisselle|afwas|wasmiddel|lessive/.test(tag))) {
      return "household";
    }
    return null;
  }
  for (const [category, ruleTags] of CATEGORY_RULES) if (ruleTags.some((tag) => set.has(tag))) return category;
  return null;
}

// Record → suggestion ------------------------------------------------------------------------------------

/** What the UI receives: one name in the user's language, a tidy brand and size, the app's category. */
export function toSuggestion(code: string, record: LookupRecord, locale: Locale, hasImage: boolean): ProductSuggestion | null {
  const genericName = pickName(record.genericNames, locale);
  const name = pickName(record.names, locale) ?? genericName;
  if (!name) return null;
  const brand = tidyBrand(record.brand);
  const quantity = parsePackageQuantity(record.quantity, locale, { amount: record.productQuantity, unit: record.productQuantityUnit });
  return {
    code,
    name,
    brand,
    genericName: genericName && genericName !== name ? genericName : null,
    quantity,
    category: mapCategory(record.categoryTags, record.productType),
    imageUrl: hasImage ? barcodeImagePath(code) : null,
    productName: composeProductName(name, brand, quantity),
  };
}
