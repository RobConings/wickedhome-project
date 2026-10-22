import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/*
 * What the assistant gets from a web page: the title, product data when the page is a product (price, shop,
 * availability, EAN…), the recipe when the page is one (name, servings, ingredients, steps) and the main text,
 * trimmed to a budget.
 *
 * - Product data comes from schema.org JSON-LD first (most Belgian shops embed it: Hubo, Brico, Praxis,
 *   Coolblue, bol.com…), then microdata (`itemprop`), then OpenGraph/`product:` meta tags.
 * - Recipe data comes from schema.org `Recipe` JSON-LD, which nearly every recipe site embeds (it is what
 *   search engines show as recipe cards). Without it the page's text is all there is.
 * - The main text comes from Mozilla's Readability (the Firefox reader view) on a light DOM (linkedom):
 *   good on articles and guides ("hoe plaats ik gyproc"). Product and listing pages are not articles, so
 *   when Readability finds too little, the text of <main> (or <body>) without menus, headers, footers,
 *   forms and scripts is used instead.
 *
 * Why two small dependencies instead of regexes: real shop pages are 0.5–1 MB of nested markup, and both a
 * tolerant HTML parser and a reader-view heuristic are far more reliable than hand-written patterns.
 * linkedom (ISC) is a light DOM without layout or scripts (jsdom is ~10× heavier); Readability (Apache-2.0)
 * has no dependencies. Neither runs any script from the page.
 */

export type ProductInfo = {
  name: string | null;
  brand: string | null;
  /** In `currency`, e.g. 14.99. */
  price: number | null;
  /** A range of offers (AggregateOffer): the highest price; `price` is the lowest. */
  highPrice: number | null;
  currency: string | null;
  /** "in stock", "out of stock", "limited", "pre-order", "discontinued", "in store only", "online only". */
  availability: string | null;
  sku: string | null;
  /** EAN / GTIN. */
  ean: string | null;
  /** The seller or site name. */
  shop: string | null;
  imageUrl: string | null;
  /** Price per unit when the shop gives one (building materials): e.g. `{ price: 10.42, unit: "m²" }`. */
  unitPrice: { price: number; unit: string } | null;
  /** The product's own description (JSON-LD), up to 400 characters. */
  description: string | null;
};

/** A schema.org Recipe, as the page states it (amounts as written: "200 g gehakt"; no conversion). */
export type RecipeInfo = {
  name: string | null;
  /** The number of people from `recipeYield` ("4 personen" → 4), when it says one. */
  servings: number | null;
  /** `recipeYield` as written, e.g. "4 personen" or "12 stuks". */
  yield: string | null;
  /** One line per ingredient, as written ("2 teentjes look, geperst"). */
  ingredients: string[];
  /** One text per step (sections flattened, in order). */
  steps: string[];
  /** Steps left out to stay within the budget. */
  stepsCut: boolean;
  /**
   * Where the steps come from: `structured` (the JSON-LD) or `page` (the JSON-LD looked cut off and the page
   * itself had more: an instruction list, embedded page data, or the text under "Bereiding").
   */
  stepsSource: "structured" | "page";
  /** The JSON-LD steps look cut off (few for many ingredients) and the page had no more either. */
  stepsIncomplete: boolean;
  imageUrl: string | null;
};

export type ExtractedPage = {
  title: string | null;
  siteName: string | null;
  description: string | null;
  /** Original recipe photo, or the page's OpenGraph image when no Recipe data is present. */
  imageUrl: string | null;
  product: ProductInfo | null;
  recipe: RecipeInfo | null;
  /** Main text, paragraphs separated by newlines, at most `textBudget` characters. */
  text: string;
  /** The text was longer than the budget. */
  textCut: boolean;
};

/** ~800 tokens: with the product fields the whole result stays under the assistant's 4 000-character result limit. */
export const TEXT_BUDGET_CHARS = 2_800;

const clean = (value: unknown, max = 200): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};

/** schema.org prices use "." for decimals ("14.99", 14.99); shops sometimes write "14,99" or "1.299,00 €". */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^\d+(\.\d{1,2})?$/.test(raw)) return Math.round(Number(raw) * 100) / 100;
  let text = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(text)) return null;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const grouping = decimal === "," ? "." : ",";
  // "1.299" with only a grouping-like dot and three digits after it: a thousands separator.
  if (decimal === "." && comma === -1 && /^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replaceAll(".", "");
  text = text.replaceAll(grouping, "").replace(decimal, ".");
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

const AVAILABILITY: [RegExp, string][] = [
  [/backorder|preorder|presale/i, "pre-order"],
  [/outofstock|soldout|out of stock/i, "out of stock"],
  [/discontinued/i, "discontinued"],
  [/limitedavailability|limited/i, "limited"],
  [/instoreonly/i, "in store only"],
  [/onlineonly/i, "online only"],
  [/instock|in stock|available/i, "in stock"],
];
function availabilityOf(value: unknown): string | null {
  const text = clean(value, 80)?.replace(/\s|_/g, "");
  if (!text) return null;
  return AVAILABILITY.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const nameOf = (value: unknown): string | null => clean(record(value)?.name ?? (typeof value === "string" ? value : null));
const typesOf = (node: Record<string, unknown>) => asArray(node["@type"]).map((type) => String(type).replace(/^https?:\/\/schema\.org\//, ""));

function imageOf(value: unknown): string | null {
  for (const item of asArray(value)) {
    const url = typeof item === "string" ? item : record(item)?.url ?? record(item)?.contentUrl;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return null;
}

function absoluteUrl(value: string | null, base: URL, max = 500): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return (url.protocol === "http:" || url.protocol === "https:") && url.href.length <= max ? url.href : null;
  } catch {
    return null;
  }
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────────────────────────────

function parseJsonLd(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    // Shops sometimes leave raw newlines or tabs inside strings.
    try {
      return JSON.parse(body.replace(/\p{Cc}+/gu, " "));
    } catch {
      return null;
    }
  }
}

const PRODUCT_TYPES = new Set(["Product", "ProductGroup", "IndividualProduct", "ProductModel"]);

/** The first schema.org Product (or ProductGroup) in the JSON-LD blocks. */
const findJsonLdProduct = (blocks: unknown[]) => findJsonLd(blocks, (types) => types.some((type) => PRODUCT_TYPES.has(type)));
/** The first schema.org Recipe in the JSON-LD blocks. */
const findJsonLdRecipe = (blocks: unknown[]) => findJsonLd(blocks, (types) => types.includes("Recipe"));

/** The first node whose @type matches, breadth first through @graph and nesting. */
function findJsonLd(blocks: unknown[], matches: (types: string[]) => boolean): Record<string, unknown> | null {
  const queue: unknown[] = [...blocks];
  let seen = 0;
  while (queue.length && seen < 2_000) {
    seen += 1;
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    const object = record(node);
    if (!object) continue;
    if (matches(typesOf(object))) return object;
    for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemOffered", "about"]) if (object[key]) queue.push(object[key]);
  }
  return null;
}

/** UN/CEFACT unit codes schema.org offers use for "per unit" prices. */
const UNIT_CODES: Record<string, string> = { MTK: "m²", MTR: "m", MTQ: "m³", LTR: "l", KGM: "kg", GRM: "g", C62: "piece", H87: "piece", MLT: "ml", CMT: "cm" };

/** A UnitPriceSpecification (or eligibleTransactionVolume, as Brico uses) with a unit: price per m², per kg… */
function unitPriceOf(offer: Record<string, unknown> | undefined): ProductInfo["unitPrice"] {
  if (!offer) return null;
  const specs = [...asArray(offer.priceSpecification), ...asArray(offer.eligibleTransactionVolume)].map(record).filter((spec): spec is Record<string, unknown> => spec !== null);
  for (const spec of specs) {
    const quantity = record(spec.referenceQuantity) ?? record(spec.eligibleQuantity);
    const code = typeof quantity?.unitCode === "string" ? quantity.unitCode.toUpperCase() : null;
    const unit = code ? UNIT_CODES[code] : clean(quantity?.unitText, 12);
    const price = parsePrice(spec.price);
    const amount = Number(quantity?.value ?? 1);
    if (unit && price !== null && amount === 1) return { price, unit };
  }
  return null;
}

function productFromJsonLd(node: Record<string, unknown>): Partial<ProductInfo> {
  // A ProductGroup carries the offers on its variants.
  const variants = asArray(node.hasVariant).map(record).filter((variant): variant is Record<string, unknown> => variant !== null);
  const offerSource = node.offers ?? variants.find((variant) => variant.offers)?.offers;
  const offers = asArray(offerSource).map(record).filter((offer): offer is Record<string, unknown> => offer !== null);
  const aggregate = offers.find((offer) => typesOf(offer).includes("AggregateOffer"));
  const flat = [...offers, ...asArray(aggregate?.offers).map(record).filter((offer): offer is Record<string, unknown> => offer !== null)];
  const priced = flat.find((offer) => parsePrice(offer.price ?? record(offer.priceSpecification)?.price) !== null);
  const spec = record(priced?.priceSpecification) ?? record(asArray(priced?.priceSpecification)[0]);
  const low = parsePrice(aggregate?.lowPrice) ?? parsePrice(priced?.price ?? spec?.price);
  const high = parsePrice(aggregate?.highPrice);
  return {
    name: clean(node.name),
    brand: nameOf(node.brand) ?? nameOf(node.manufacturer),
    price: low,
    highPrice: high !== null && low !== null && high > low ? high : null,
    currency: clean(priced?.priceCurrency ?? spec?.priceCurrency ?? aggregate?.priceCurrency, 8),
    availability: availabilityOf(priced?.availability ?? offers[0]?.availability),
    sku: clean(node.sku ?? node.productID ?? node.mpn, 60),
    ean: clean(node.gtin13 ?? node.gtin ?? node.gtin14 ?? node.gtin12 ?? node.gtin8 ?? node.ean, 20),
    shop: nameOf(priced?.seller ?? offers[0]?.seller),
    imageUrl: imageOf(node.image ?? variants[0]?.image),
    unitPrice: unitPriceOf(priced),
    description: clean(node.description, 400),
  };
}

// ── Recipes (JSON-LD) ─────────────────────────────────────────────────────────────────────────────────

const RECIPE_LIMITS = { ingredients: 60, ingredientChars: 160, steps: 40, stepChars: 500, budget: 2_700 };

/** Recipe sites put HTML in their strings ("<p>Snipper de ui</p>", "&amp;"): plain text without tags. */
function plain(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return clean(text, max);
}

/** "4", 4, "4 personen", ["4", "4 servings"] → 4; a number of people between 1 and 100, else null. */
export function servingsFromYield(value: unknown): number | null {
  for (const item of asArray(value)) {
    const match = /\d+/.exec(typeof item === "number" ? String(item) : typeof item === "string" ? item : "");
    const number = match ? Number(match[0]) : NaN;
    if (Number.isInteger(number) && number >= 1 && number <= 100) return number;
  }
  return null;
}

/**
 * `recipeInstructions` in every shape sites use: one text (split per line), a list of texts, HowToStep
 * (`text`, else `name`), HowToSection / ItemList (`itemListElement`, flattened in order).
 */
function stepsOf(value: unknown, depth = 0): string[] {
  if (depth > 6) return [];
  if (typeof value === "string") {
    return value
      .split(/\n+|<\/p>|<br\s*\/?>/i)
      .map((line) => plain(line, RECIPE_LIMITS.stepChars))
      .filter((line): line is string => Boolean(line));
  }
  if (Array.isArray(value)) return value.flatMap((item) => stepsOf(item, depth + 1));
  const node = record(value);
  if (!node) return [];
  if (node.itemListElement) return stepsOf(node.itemListElement, depth + 1);
  const text = plain(node.text ?? node.name ?? node.description, RECIPE_LIMITS.stepChars);
  return text ? [text] : [];
}

export function recipeFromJsonLd(node: Record<string, unknown>, base: URL): RecipeInfo | null {
  const ingredients = asArray(node.recipeIngredient ?? node.ingredients)
    .map((line) => plain(line, RECIPE_LIMITS.ingredientChars))
    .filter((line): line is string => Boolean(line))
    .slice(0, RECIPE_LIMITS.ingredients);
  const allSteps = stepsOf(node.recipeInstructions).slice(0, RECIPE_LIMITS.steps);
  const name = plain(node.name, 200);
  if (!name && !ingredients.length) return null;
  const { steps, cut } = fitSteps(ingredients, allSteps);
  const yieldText = asArray(node.recipeYield).map((item) => plain(item, 60)).find(Boolean) ?? null;
  return {
    name,
    servings: servingsFromYield(node.recipeYield),
    yield: yieldText,
    ingredients,
    steps,
    stepsCut: cut,
    stepsSource: "structured",
    stepsIncomplete: false,
    imageUrl: absoluteUrl(imageOf(node.image), base, 2000),
  };
}

/** The steps that fit next to the ingredients: they give way when a recipe is very long (the ingredients matter most). */
function fitSteps(ingredients: readonly string[], allSteps: readonly string[]): { steps: string[]; cut: boolean } {
  let used = ingredients.reduce((total, line) => total + line.length + 4, 0);
  const steps: string[] = [];
  for (const step of allSteps.slice(0, RECIPE_LIMITS.steps)) {
    if (used + step.length > RECIPE_LIMITS.budget && steps.length) break;
    steps.push(step);
    used += step.length + 4;
  }
  return { steps, cut: steps.length < allSteps.length };
}

// ── Recipe steps from the page (when the JSON-LD cuts them off) ─────────────────────────────────────────

/** Few structured steps for many ingredients: the site probably cut them off (e.g. a teaser for its "cooking mode"). */
export const stepsLookCut = (steps: number, ingredients: number) => steps < 4 && ingredients >= 8;

const STEP_WORDS = /instruction|step|bereiding|stap|method|preparation|directions|werkwijze/i;
const LEADING_NUMBER = /^\s*(?:(?:stap|step)\s*)?\d{1,2}\s*[.):-]?\s+/i;

/** One step's text: tags and a leading "3." or "Stap 3" off; null when too short to be a step. */
function stepText(value: string | null | undefined): string | null {
  const text = plain(value ?? "", RECIPE_LIMITS.stepChars)?.replace(LEADING_NUMBER, "").trim() ?? "";
  return text.length >= 12 ? text : null;
}

/** In order, without repeats (a step shown twice, e.g. for mobile and desktop). */
function uniqueSteps(steps: (string | null)[]): string[] {
  const seen = new Set<string>();
  return steps.filter((step): step is string => {
    if (!step) return false;
    const key = step.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const textOf = (element: El) => blockText(element).replace(/\n+/g, " ");

/**
 * Instruction lists in the HTML: microdata (`itemprop="recipeInstructions"`), repeated items marked as a step
 * (`data-testid`/class/id with instruction, step, bereiding…, e.g. 13 × `data-testid="recipe-instruction"`), and
 * `<ol>`/`<ul>` lists inside such a container. The longest list wins.
 */
export function htmlInstructionSteps(document: Doc): string[] {
  const candidates: string[][] = [];
  const micro = [...document.querySelectorAll('[itemprop="recipeInstructions"]')] as El[];
  if (micro.length > 1) candidates.push(uniqueSteps(micro.map((element) => stepText(textOf(element)))));
  for (const element of micro) {
    const items = [...element.querySelectorAll("li")] as El[];
    if (items.length) candidates.push(uniqueSteps(items.map((item) => stepText(textOf(item)))));
  }
  // Repeated step items with the same marker.
  const groups = new Map<string, El[]>();
  for (const element of [...document.querySelectorAll("[data-testid], [class], [id]")].slice(0, 20_000) as El[]) {
    for (const attribute of ["data-testid", "class", "id"]) {
      const value = element.getAttribute(attribute);
      if (!value || !STEP_WORDS.test(value) || value.length > 120) continue;
      const key = `${attribute}=${value}`;
      groups.set(key, [...(groups.get(key) ?? []), element]);
    }
  }
  for (const [, elements] of groups) {
    // Only the outermost: a step item's own children often carry the same words.
    const outer = elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
    if (outer.length > 1) candidates.push(uniqueSteps(outer.map((element) => stepText(textOf(element)))));
    for (const container of outer) {
      for (const list of [...container.querySelectorAll("ol, ul")] as El[]) {
        const items = ([...list.children] as El[]).filter((child) => child.localName === "li");
        if (items.length > 1) candidates.push(uniqueSteps(items.map((item) => stepText(textOf(item)))));
      }
    }
  }
  return longest(candidates);
}

const STEP_OBJECT = /"(?:step|position|stepNumber)"\s*:\s*(\d{1,2})\s*,\s*"(?:description|text|instruction)"\s*:\s*"((?:[^"\\]|\\.){12,3000}?)"/g;
const STEP_OBJECT_REVERSED = /"(?:description|text|instruction)"\s*:\s*"((?:[^"\\]|\\.){12,3000}?)"\s*,\s*"(?:step|position|stepNumber)"\s*:\s*(\d{1,2})/g;

/** Objects like `{"step": 3, "description": "…"}` in a JSON text, by step number (the first of each number). */
export function stepsFromJsonText(text: string): string[] {
  const byNumber = new Map<number, string>();
  const add = (number: number, raw: string) => {
    if (byNumber.has(number)) return;
    let value: string;
    try {
      value = JSON.parse(`"${raw}"`) as string;
    } catch {
      return;
    }
    const step = stepText(value);
    if (step) byNumber.set(number, step);
  };
  for (const match of text.matchAll(STEP_OBJECT)) add(Number(match[1]), match[2] ?? "");
  for (const match of text.matchAll(STEP_OBJECT_REVERSED)) add(Number(match[2]), match[1] ?? "");
  return uniqueSteps([...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([, step]) => step));
}

/**
 * Steps in data embedded for the page's own scripts: `__NEXT_DATA__` and Next.js flight chunks
 * (`self.__next_f.push([1, "…"])`, JSON inside a JavaScript string: decoded first).
 */
export function embeddedJsonSteps(document: Doc): string[] {
  const texts: string[] = [];
  const next = document.querySelector("script#__NEXT_DATA__")?.textContent;
  if (next) texts.push(next);
  const flight: string[] = [];
  for (const script of [...document.querySelectorAll("script:not([src])")]) {
    const code = script.textContent ?? "";
    for (const match of code.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)\s*;?\s*(?=self\.__next_f|$)/g)) {
      try {
        const chunk = JSON.parse(match[1] ?? "") as unknown[];
        if (typeof chunk[1] === "string") flight.push(chunk[1]);
      } catch {
        // Not JSON (minified differently): skipped.
      }
    }
  }
  if (flight.length) texts.push(flight.join(""));
  return longest(texts.map(stepsFromJsonText));
}

const STEPS_HEADING = /^(?:bereiding|bereidingswijze|werkwijze|instructies|instructions|directions|method|preparation|zo maak je het|aan de slag)\b/i;
const NEXT_HEADING = /^(?:tips?|ingrediënten|ingredients|voedingswaarde|nutrition|reacties|comments|bewaren|storage|serveertip|benodigdheden|deel dit|share)\b/i;

/** The page text under a "Bereiding" / "Instructions" heading, one step per line, until the next section. */
export function headingTextSteps(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => STEPS_HEADING.test(line.trim()) && line.trim().length < 40);
  if (start < 0) return [];
  const steps: (string | null)[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (NEXT_HEADING.test(trimmed) && trimmed.length < 40) break;
    if (/^\d{1,2}$/.test(trimmed)) continue;
    steps.push(stepText(trimmed));
    if (steps.length >= RECIPE_LIMITS.steps) break;
  }
  return uniqueSteps(steps);
}

const longest = (lists: string[][]) => lists.reduce<string[]>((best, list) => (list.length > best.length ? list : best), []);

/**
 * Checks the JSON-LD steps against the page: when the page holds more steps (an instruction list or embedded
 * data), or the JSON-LD looks cut off and the text under "Bereiding" has more, those are used (`stepsSource:
 * "page"`). Still few for many ingredients afterwards: `stepsIncomplete`.
 */
export function completeRecipeSteps(recipe: RecipeInfo, document: Doc, pageText: () => string): RecipeInfo {
  const structured = recipe.steps.length + (recipe.stepsCut ? 1 : 0);
  const cutOff = stepsLookCut(recipe.steps.length, recipe.ingredients.length);
  let found = longest([htmlInstructionSteps(document), embeddedJsonSteps(document)]);
  if (found.length <= structured && cutOff) found = longest([found, headingTextSteps(pageText())]);
  if (found.length > structured && found.length >= 2) {
    const { steps, cut } = fitSteps(recipe.ingredients, found);
    return { ...recipe, steps, stepsCut: cut, stepsSource: "page", stepsIncomplete: false };
  }
  return { ...recipe, stepsIncomplete: cutOff };
}

// ── Microdata and meta tags ─────────────────────────────────────────────────────────────────────────

type Doc = ReturnType<typeof parseHTML>["document"];
type El = NonNullable<ReturnType<Doc["querySelector"]>>;

const attrOf = (element: El | null | undefined, name: string) => element?.getAttribute(name)?.trim() || null;
const valueOf = (element: El | null | undefined) =>
  element ? clean(attrOf(element, "content") ?? attrOf(element, "href") ?? attrOf(element, "value") ?? element.textContent) : null;

function productFromMicrodata(document: Doc): Partial<ProductInfo> | null {
  const scope = document.querySelector('[itemtype*="schema.org/Product" i]');
  if (!scope) return null;
  const prop = (name: string) => scope.querySelector(`[itemprop="${name}"]`);
  const brand = prop("brand");
  return {
    name: valueOf(prop("name")),
    brand: brand ? (valueOf(brand.querySelector('[itemprop="name"]')) ?? valueOf(brand)) : null,
    price: parsePrice(valueOf(prop("price")) ?? valueOf(prop("lowPrice"))),
    currency: clean(valueOf(prop("priceCurrency")), 8),
    availability: availabilityOf(valueOf(prop("availability"))),
    sku: clean(valueOf(prop("sku")), 60),
    ean: clean(valueOf(prop("gtin13")) ?? valueOf(prop("gtin")), 20),
    imageUrl: attrOf(prop("image"), "src") ?? valueOf(prop("image")),
  };
}

function metaTags(document: Doc): Map<string, string> {
  const tags = new Map<string, string>();
  for (const tag of document.querySelectorAll("meta")) {
    const key = (tag.getAttribute("property") ?? tag.getAttribute("name") ?? tag.getAttribute("itemprop"))?.trim().toLowerCase();
    const content = tag.getAttribute("content")?.trim();
    if (key && content && !tags.has(key)) tags.set(key, content);
  }
  return tags;
}

function productFromMeta(meta: Map<string, string>): Partial<ProductInfo> {
  const get = (...keys: string[]) => keys.map((key) => meta.get(key)).find(Boolean) ?? null;
  return {
    name: clean(get("og:title")),
    brand: clean(get("product:brand", "og:brand")),
    price: parsePrice(get("product:price:amount", "og:price:amount", "product:sale_price:amount", "price")),
    currency: clean(get("product:price:currency", "og:price:currency", "product:sale_price:currency", "pricecurrency"), 8),
    availability: availabilityOf(get("product:availability", "og:availability")),
    sku: clean(get("product:retailer_item_id"), 60),
    ean: clean(get("product:ean", "product:gtin"), 20),
    imageUrl: get("og:image", "twitter:image"),
  };
}

const PRODUCT_KEYS = ["name", "brand", "price", "highPrice", "currency", "availability", "sku", "ean", "shop", "imageUrl", "unitPrice", "description"] as const;

/** First non-empty value per field, in the order given. */
function mergeProduct(...sources: (Partial<ProductInfo> | null)[]): ProductInfo {
  const product = Object.fromEntries(PRODUCT_KEYS.map((key) => [key, null])) as Record<(typeof PRODUCT_KEYS)[number], unknown>;
  for (const key of PRODUCT_KEYS) {
    for (const source of sources) {
      const value = source?.[key];
      if (value !== null && value !== undefined && value !== "") {
        product[key] = value;
        break;
      }
    }
  }
  return product as ProductInfo;
}

// ── Main text ───────────────────────────────────────────────────────────────────────────────────────

const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul",
]);
const SKIP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "canvas", "button", "select", "option", "head", "link", "meta"]);
const BOILERPLATE = "nav, header, footer, aside, form, dialog, [role=navigation], [role=banner], [role=contentinfo], [role=dialog], [aria-hidden=true], [hidden], .cookie, #cookie, [class*=cookie i], [id*=cookie i]";

/** Text with line breaks at block elements (a cheap `innerText`), whitespace collapsed, short repeats dropped. */
function blockText(root: El): string {
  const parts: string[] = [];
  const walk = (node: { nodeType: number; childNodes: ArrayLike<unknown>; localName?: string; textContent?: string | null }) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.localName ?? "";
    if (SKIP.has(tag)) return;
    const block = BLOCK.has(tag);
    if (block) parts.push("\n");
    for (const child of Array.from(node.childNodes)) walk(child as typeof node);
    if (block) parts.push("\n");
  };
  walk(root as unknown as Parameters<typeof walk>[0]);
  const seen = new Set<string>();
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (line.length < 2) return false;
      if (line.length < 80 && seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join("\n");
}

function mainText(html: string, document: Doc): string {
  // Readability changes the document it reads: give it its own copy.
  let article: { content?: string | null; textContent?: string | null } | null;
  try {
    article = new Readability(parseHTML(html).document as unknown as Document, { charThreshold: 400, keepClasses: false, maxElemsToParse: 25_000 }).parse();
  } catch {
    // Too many elements or markup Readability can't handle: use the fallback below.
    article = null;
  }
  if (article?.content && (article.textContent ?? "").trim().length >= 400) {
    const body = parseHTML(`<html><body>${article.content}</body></html>`).document.body;
    if (body) return blockText(body as El);
  }
  for (const element of document.querySelectorAll(BOILERPLATE)) element.remove();
  const root = document.querySelector("main, [role=main], article") ?? document.body;
  return root ? blockText(root as El) : "";
}

/** Cuts at a line or sentence end near the budget. */
export function trimText(text: string, budget = TEXT_BUDGET_CHARS): { text: string; cut: boolean } {
  if (text.length <= budget) return { text, cut: false };
  const slice = text.slice(0, budget);
  const end = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
  return { text: `${(end > budget * 0.6 ? slice.slice(0, end + 1) : slice).trim()} …`, cut: true };
}

// ── Entry points ────────────────────────────────────────────────────────────────────────────────────

export function extractPage(html: string, base: URL, textBudget = TEXT_BUDGET_CHARS): ExtractedPage {
  const { document } = parseHTML(html);
  const meta = metaTags(document);
  const blocks = [...document.querySelectorAll('script[type="application/ld+json" i]')].map((script) => parseJsonLd(script.textContent ?? "")).filter(Boolean);
  const ldNode = findJsonLdProduct(blocks);
  const recipeNode = findJsonLdRecipe(blocks);
  const structuredRecipe = recipeNode ? recipeFromJsonLd(recipeNode, base) : null;
  const imageUrl = structuredRecipe?.imageUrl ?? absoluteUrl(meta.get("og:image") ?? null, base, 2000);
  if (structuredRecipe) structuredRecipe.imageUrl = imageUrl;
  const fromLd = ldNode ? productFromJsonLd(ldNode) : null;
  const fromMicro = productFromMicrodata(document);
  const fromMeta = productFromMeta(meta);
  const siteName = clean(meta.get("og:site_name"), 80);
  const isProductPage = Boolean(fromLd || fromMicro || meta.get("og:type")?.toLowerCase().includes("product") || fromMeta.price !== null);
  let product: ProductInfo | null = null;
  if (isProductPage) {
    product = mergeProduct(fromLd, fromMicro, fromMeta, { shop: siteName });
    product.imageUrl = absoluteUrl(product.imageUrl, base);
    if (product.price === null && !product.name) product = null;
  }
  const titleTag = clean(document.querySelector("title")?.textContent, 200);
  const title = clean(meta.get("og:title"), 200) ?? titleTag ?? product?.name ?? structuredRecipe?.name ?? null;
  const description = product?.description ?? clean(meta.get("og:description") ?? meta.get("description"), 300);
  // Steps from the page itself before the main-text pass (which removes boilerplate from the document).
  let fullText: string | null = null;
  const pageText = () => (fullText ??= mainText(html, parseHTML(html).document as unknown as Doc));
  const recipe = structuredRecipe ? completeRecipeSteps(structuredRecipe, document, pageText) : null;
  const { text, cut } = trimText(fullText ?? mainText(html, document), textBudget);
  return { title, siteName, description, imageUrl, product, recipe, text, textCut: cut };
}

/** A plain-text page (text/plain): collapsed and trimmed like HTML text. */
export function extractPlainText(body: string, textBudget = TEXT_BUDGET_CHARS): ExtractedPage {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  const { text, cut } = trimText(lines, textBudget);
  return { title: null, siteName: null, description: null, imageUrl: null, product: null, recipe: null, text, textCut: cut };
}
