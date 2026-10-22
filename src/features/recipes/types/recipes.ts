import { z } from "zod";
import { idSchema } from "@/types/common";
import type { NeedComparison, StockUnitInfo } from "@/types/units";
import { canManageHousehold, type HouseholdRole } from "@/types/roles";

/*
 * Recipes: ingredients linked to the household's products (so stock can be checked) and steps. A meal on the
 * "To cook" list (`MealPlanEntry`) is also its cooking session: nothing is taken from stock automatically, the
 * cook taps what she actually used (each tap is a `cooked` stock movement, undoable), can add extra
 * ingredients, and marks it done. An ingredient's quantity and unit are the recipe's own amount (300 g, 2 pcs);
 * stock is counted in the product's stock unit (packs), and `compareNeed` (@/types/units) converts between them
 * through the product's content per package (200 g). Units that don't convert (el, teentje) are `unknown_amount`.
 */

// ── Pure helpers (API and UI) ───────────────────────────────────────────────────────────────────────

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** How much a recipe's amounts are multiplied by for `servings` (1 when the recipe doesn't say how many it serves). */
export const servingsScale = (recipeServings: number | null | undefined, servings: number | null | undefined) =>
  recipeServings && servings ? servings / recipeServings : 1;

/** `in_stock`, `short`, `not_kept`, `unknown_amount` (the units don't convert: set the product's content per package), `unknown` (no product). */
export type IngredientStatus = NeedComparison["status"];

/**
 * A linked product as recipes show it: a link to its page, its webshop link (the default shop's, else the first
 * one with a URL) and photo, and how its stock is counted (stock unit and content per package).
 */
export type IngredientProduct = StockUnitInfo & {
  id: string;
  name: string;
  imageUrl: string | null;
  shopLink: { url: string; shopName: string } | null;
};

export const productPath = (id: string) => `/inventory/products/${encodeURIComponent(id)}`;

/** "10 min", "1 uur", "25 minuten", "1,5 hours" in a step's text → minutes; the first one found, else null. */
export function timerFromText(text: string): number | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(min(?:uut|uten|ute|utes|s)?|u(?:ur)?|h(?:our|ours|rs)?)\b/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]!.replace(",", "."));
  const minutes = /^(u|h)/i.test(match[2]!) ? value * 60 : value;
  return minutes >= 1 && minutes <= 24 * 60 ? Math.round(minutes) : null;
}

/**
 * Pasted instructions → steps: one per numbered line ("1.", "2)", "Stap 3:") or, without numbers, one per
 * paragraph (one per line when there are no blank lines). The numbers are dropped; a step's timer comes from
 * its text ("bak 10 min").
 */
export function splitInstructions(text: string): { text: string; timerMinutes: number | null }[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const numbered = /^\s*(?:(?:stap|step)\s*)?\d{1,2}\s*[.):-]\s*/i;
  const lines = normalized.split("\n");
  let parts: string[];
  if (lines.filter((line) => numbered.test(line)).length >= 2) {
    parts = [];
    for (const line of lines) {
      if (numbered.test(line) || parts.length === 0) parts.push(line.replace(numbered, ""));
      else parts[parts.length - 1] += ` ${line.trim()}`;
    }
  } else {
    parts = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/) : lines;
  }
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_RECIPE_STEPS)
    .map((part) => ({
      text: part.slice(0, 2000),
      timerMinutes: timerFromText(part),
    }));
}

/** Steps back to the text the form edits: one paragraph per step. */
export const joinSteps = (steps: readonly { text: string }[]) => steps.map((step) => step.text).join("\n\n");

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Does a step mention this ingredient? Its name, or a word of 4+ letters of it, appears in the text. */
export function stepMentions(stepText: string, name: string): boolean {
  const text = fold(stepText);
  const folded = fold(name).trim();
  if (folded && text.includes(folded)) return true;
  return folded.split(/[^a-z0-9]+/).some((word) => word.length >= 4 && text.includes(word.replace(/(en|s)$/, "")));
}

/** Ingredients mentioned in the current step first, otherwise in recipe order. */
export function sortForStep<T extends { name: string }>(items: readonly T[], stepText: string | null | undefined): T[] {
  if (!stepText) return [...items];
  const mentioned = items.filter((item) => stepMentions(stepText, item.name));
  return [...mentioned, ...items.filter((item) => !mentioned.includes(item))];
}

type Role = HouseholdRole;

/** Adults and owners add, edit and delete recipes and plan meals; everyone reads. Mirrors the API. */
export const canManageRecipes = canManageHousehold;
/** Everyone, children too, may cook: start, tap what was used, add extras, step through, mark it done. */
export const canCook = (_role: Role) => true;

export const recipePath = (id: string) => `/recipes/${encodeURIComponent(id)}`;
export const cookingPath = (entryId: string) => `/recipes/cook/${encodeURIComponent(entryId)}`;

// ── Input ───────────────────────────────────────────────────────────────────────────────────────────

export const MAX_RECIPE_INGREDIENTS = 100;
export const MAX_RECIPE_STEPS = 100;

export const recipeCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80).transform((name) => name.replace(/\s+/g, " ")),
});
export type RecipeCategoryInput = z.infer<typeof recipeCategoryInputSchema>;
export type RecipeCategory = { id: string; name: string; recipeCount: number };

/** The category filter used in links, the overview and the API. */
export function filterRecipesByCategory<T extends Pick<RecipeSummary, "category">>(recipes: readonly T[], categoryId?: string): T[] {
  return recipes.filter((recipe) => !categoryId || (categoryId === "none" ? !recipe.category : recipe.category?.id === categoryId));
}

/** Only web links; never `javascript:` or other schemes we would render as a link. */
const webUrlSchema = z.url({ protocol: /^https?$/ }).max(1000);
const quantitySchema = z.coerce.number().positive().max(100_000).transform(round3);
const servingsSchema = z.coerce.number().int().min(1).max(100);

export const recipeIngredientInputSchema = z.object({
  /** An existing ingredient of the recipe being edited: kept (so a meal being cooked keeps its taps). */
  id: idSchema.optional().nullable(),
  /** The household product it is; leave out for a free-text ingredient. */
  productId: idSchema.optional().nullable(),
  name: z.string().trim().min(1).max(120),
  /** The recipe's own amount for its servings (300 for "300 g"); converted to the product's packs to check stock. */
  quantity: quantitySchema.optional().nullable(),
  /** The recipe's unit ("g", "ml", "pcs", "el"…); empty = pieces/packages. */
  unit: z.string().trim().max(20).optional().nullable(),
  /** Anything else about it, e.g. "geraspt", "in blokjes". */
  note: z.string().trim().max(200).optional().nullable(),
  optional: z.boolean().default(false),
});
export type RecipeIngredientInput = z.infer<typeof recipeIngredientInputSchema>;

export const recipeStepInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  timerMinutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional()
    .nullable(),
});
export type RecipeStepInput = z.infer<typeof recipeStepInputSchema>;

/** Body of `POST /api/recipes` and `PUT /api/recipes/:id`. Ingredients and steps are saved in the given order. */
export const recipeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: idSchema.optional().nullable(),
  servings: servingsSchema.optional().nullable(),
  sourceUrl: webUrlSchema.optional().nullable(),
  imageUrl: z.url({ protocol: /^https?$/ }).max(2000).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  ingredients: z.array(recipeIngredientInputSchema).max(MAX_RECIPE_INGREDIENTS).default([]),
  steps: z.array(recipeStepInputSchema).max(MAX_RECIPE_STEPS).default([]),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

export const MAX_RECIPE_IMPORT_BATCH = 25;
/** A source-only entry can categorize an existing recipe without supplying its content again. */
export const recipeImportItemSchema = recipeInputSchema.partial().extend({
  sourceUrl: webUrlSchema,
  categoryId: idSchema.optional(),
  ingredients: z.array(recipeIngredientInputSchema.omit({ id: true })).max(MAX_RECIPE_INGREDIENTS).optional(),
  steps: z.array(recipeStepInputSchema).max(MAX_RECIPE_STEPS).optional(),
});
export const recipeImportInputSchema = z.object({
  categoryId: idSchema.optional(),
  recipes: z.array(recipeImportItemSchema).min(1).max(MAX_RECIPE_IMPORT_BATCH),
});
export type RecipeImportInput = z.infer<typeof recipeImportInputSchema>;
export type RecipeImportResult = {
  created: number;
  categorized: number;
  unchanged: number;
  items: { index: number; id: string; name: string; status: "created" | "categorized" | "unchanged"; existingDuplicates?: number }[];
};

const parseJson = (value: unknown) => {
  if (typeof value !== "string") return value ?? [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

/**
 * The recipe form as posted: the ingredients editor posts its rows as JSON, the steps are one textarea (split
 * with `splitInstructions`), "example.be" gets https://.
 */
export const recipeFormSchema = recipeInputSchema.extend({
  categoryId: z.preprocess((value) => value === "" || value === "none" ? null : value, recipeInputSchema.shape.categoryId),
  ingredients: z.preprocess(parseJson, recipeInputSchema.shape.ingredients),
  steps: z.preprocess((value) => (typeof value === "string" ? splitInstructions(value) : (value ?? [])), recipeInputSchema.shape.steps),
  sourceUrl: z.preprocess(
    (value) => (typeof value === "string" && !/^[a-z][a-z\d+.-]*:/i.test(value) ? `https://${value}` : value),
    recipeInputSchema.shape.sourceUrl,
  ),
});

/** `PUT /api/recipes/:id/cover`: an image attached to the recipe, or null to remove the cover. */
export const recipeCoverInputSchema = z.object({ fileId: idSchema.nullable() });
export type RecipeCoverInput = z.infer<typeof recipeCoverInputSchema>;

/** Query of `GET /api/recipes`. */
export const recipeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Category id, or "none" for recipes without a category. Omitted means all categories. */
  categoryId: idSchema.optional(),
});
export type RecipeListQuery = z.infer<typeof recipeListQuerySchema>;

/** Query of `GET /api/recipes/:id/check`: for how many people (default: the recipe's servings). */
export const recipeCheckQuerySchema = z.object({
  servings: servingsSchema.optional(),
});

/** Body of `POST /api/recipes/meal-plan`: put a recipe on "To cook" and the chosen missing ingredients on the list. */
export const mealPlanInputSchema = z.object({
  recipeId: idSchema,
  servings: servingsSchema,
  /** Ingredients to buy, with how much (default: the shortfall from the check). */
  items: z
    .array(
      z.object({
        ingredientId: idSchema,
        quantity: quantitySchema.optional().nullable(),
      }),
    )
    .max(MAX_RECIPE_INGREDIENTS)
    .default([]),
});
export type MealPlanInput = z.infer<typeof mealPlanInputSchema>;

/** Body of `POST /api/recipes/:id/cook`: start cooking a recipe right away (reuses its open meal when there is one). */
export const cookRecipeInputSchema = z.object({
  servings: servingsSchema.optional().nullable(),
});
export type CookRecipeInput = z.infer<typeof cookRecipeInputSchema>;

/**
 * Body of `POST /api/recipes/meal-plan/:id/use`: "I used this". One of a recipe ingredient, an extra, or any
 * product (which then becomes an extra of this meal). Can be sent again for "1 more". `quantity` is in the
 * product's stock unit (1.5 packs), unless `unit` says otherwise ("g"): then it is converted, and refused when
 * it doesn't convert. Without a product, it is in the ingredient's own unit.
 */
export const mealPlanUseInputSchema = z
  .object({
    ingredientId: idSchema.optional(),
    extraId: idSchema.optional(),
    productId: idSchema.optional(),
    quantity: quantitySchema,
    unit: z.string().trim().max(20).optional().nullable(),
  })
  .refine((value) => [value.ingredientId, value.extraId, value.productId].filter(Boolean).length === 1, {
    message: "chooseOne",
    path: ["ingredientId"],
  });
export type MealPlanUseInput = z.infer<typeof mealPlanUseInputSchema>;

/** Body of `POST /api/recipes/meal-plan/:id/extras`: an ingredient added while cooking (a product or free text). */
export const mealPlanExtraInputSchema = z
  .object({
    productId: idSchema.optional().nullable(),
    name: z.string().trim().max(120).optional().nullable(),
    quantity: quantitySchema.optional().nullable(),
    unit: z.string().trim().max(20).optional().nullable(),
    /** Also add it to the recipe for next time (owners and adults). */
    saveToRecipe: z.boolean().default(false),
    /** Also record it as used right away (deducts `quantity`, or 1, from stock). */
    use: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.productId || value.name), {
    message: "chooseProductOrName",
    path: ["name"],
  });
export type MealPlanExtraInput = z.infer<typeof mealPlanExtraInputSchema>;

/** The "+ Ingredient" form while cooking, as posted (a checked switch posts "on", an unchecked one nothing). */
export const mealPlanExtraFormSchema = z
  .object({
    productId: idSchema.optional().nullable(),
    name: z.string().trim().max(120).optional().nullable(),
    quantity: quantitySchema.optional().nullable(),
    unit: z.string().trim().max(20).optional().nullable(),
    saveToRecipe: z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean()),
    use: z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean()),
  })
  .refine((value) => Boolean(value.productId || value.name), {
    message: "chooseProductOrName",
    path: ["name"],
  });

/** Body of `PUT /api/recipes/meal-plan/:id/step`: the step the cook is at (0-based). */
export const mealPlanStepInputSchema = z.object({
  step: z.coerce.number().int().min(0).max(MAX_RECIPE_STEPS),
});
export type MealPlanStepInput = z.infer<typeof mealPlanStepInputSchema>;

/** Query of `DELETE /api/recipes/meal-plan/:id`: also remove the open shopping items added for it. */
export const mealPlanDeleteQuerySchema = z.object({
  removeItems: z.preprocess((value) => value === "1" || value === "true" || value === true, z.boolean()).default(false),
});

/** Query of `GET /api/recipes/meal-plan`. */
export const mealPlanListQuerySchema = z.object({
  /** Also meals made in the last 14 days. */
  cooked: z.preprocess((value) => value === "1" || value === "true" || value === true, z.boolean()).default(false),
});

/** Error codes the contract produces itself; forms translate them (`recipes:errors.<code>`). */
export const RECIPE_ERROR_CODES = ["chooseOne", "chooseProductOrName"] as const;

// ── Output ──────────────────────────────────────────────────────────────────────────────────────────

export type RecipeIngredient = {
  id: string;
  position: number;
  productId: string | null;
  /** The product's name when linked (may differ from the ingredient's own name). */
  productName: string | null;
  /** The linked product: page, webshop link, photo, stock unit and content per package. */
  product: IngredientProduct | null;
  name: string;
  /** The recipe's own amount and unit (300 g) for the recipe's servings. */
  quantity: number | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
};

export type RecipeStep = {
  id: string;
  position: number;
  text: string;
  timerMinutes: number | null;
};

export type RecipeSummary = {
  id: string;
  name: string;
  category: Pick<RecipeCategory, "id" | "name"> | null;
  servings: number | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  coverFileId: string | null;
  ingredientCount: number;
  stepCount: number;
  /** Ingredient names, for search. */
  ingredientNames: string[];
  /** ISO timestamp. */
  updatedAt: string;
};

export type Recipe = RecipeSummary & {
  notes: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** ISO timestamp. */
  createdAt: string;
};

/** One ingredient in the check before planning: what it needs for these servings and what's in stock. */
export type IngredientCheck = {
  ingredientId: string;
  name: string;
  productId: string | null;
  productName: string | null;
  product: IngredientProduct | null;
  note: string | null;
  optional: boolean;
  /** For these servings, in the recipe's unit (`unit`). */
  needed: number;
  unit: string | null;
  /** Total (shared) stock in the product's stock unit (`product.unit`); null without a product or when it isn't kept. */
  stock: number | null;
  /** The units convert (`compareNeed`): the fields below are known. */
  comparable: boolean;
  /** The need in stock units (1.5 packs). */
  neededInStockUnits: number | null;
  /** The stock in the recipe's unit (200 g). */
  stockInRecipeUnit: number | null;
  /** Missing, in the recipe's unit; null when it can't be said. */
  shortfall: number | null;
  /** What to buy, in stock units: whole packages when the stock counts packages. */
  shortfallPackages: number | null;
  status: IngredientStatus;
  /** An open shopping item for it (or any product sharing its stock) is on a list already. */
  onList: boolean;
};

/** `GET /api/recipes/:id/check`. */
export type RecipeCheck = {
  recipeId: string;
  servings: number;
  ingredients: IngredientCheck[];
};

export const MEAL_PLAN_STATUSES = ["open", "cooking", "cooked"] as const;
export type MealPlanStatus = (typeof MEAL_PLAN_STATUSES)[number];

/** A meal on the "To cook" list. */
export type MealPlanEntry = {
  id: string;
  recipeId: string;
  recipeName: string;
  imageUrl: string | null;
  coverFileId: string | null;
  servings: number;
  status: MealPlanStatus;
  /** 0-based. */
  currentStep: number;
  stepCount: number;
  addedByName: string | null;
  /** ISO timestamps. */
  createdAt: string;
  startedAt: string | null;
  cookedAt: string | null;
  /** Open shopping items still on a list for it. */
  openItemCount: number;
};

/**
 * An ingredient in the cooking view: a recipe ingredient or an extra added while cooking. Amounts with a product
 * are counted in its stock unit (what a tap takes from stock); without a product, in the ingredient's own unit.
 */
export type CookingIngredient = {
  kind: "ingredient" | "extra";
  id: string;
  name: string;
  productId: string | null;
  product: IngredientProduct | null;
  /** For these servings in the recipe's unit (`unit`); null for an extra without an amount. */
  needed: number | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
  /** The recipe's unit converts to the product's stock unit (always true without a product or an amount). */
  comparable: boolean;
  /** The need in stock units (1.5 packs), when it converts. */
  neededInStockUnits: number | null;
  /**
   * What one "Used" tap takes: the need in stock units (or 1). Null when the units don't convert: the tap then
   * asks how much, in the stock unit, instead of taking a wrong amount.
   */
  tapAmount: number | null;
  /** Used so far (taps that weren't undone), in stock units (without a product: the ingredient's own unit). */
  used: number;
  /** `used` in the recipe's unit, when it converts. */
  usedInRecipeUnit: number | null;
  /** Stock left (shared stock) in stock units; null without a product or when it isn't kept in stock. */
  stock: number | null;
  /** The last usage that can be undone. */
  lastUsageId: string | null;
};

/** One "Used" tap. */
export type CookUsage = {
  id: string;
  kind: "ingredient" | "extra";
  /** The ingredient's or extra's id. */
  refId: string | null;
  name: string;
  /** In the product's stock unit (`unit`); without a product, in the ingredient's own unit. */
  quantity: number;
  unit: string | null;
  /** The same in the recipe's unit (300 g), when that differs and converts. */
  recipeQuantity: { amount: number; unit: string } | null;
  /** How much really left the stock (less when the stock ran out, 0 when not kept in stock). */
  deducted: number;
  undone: boolean;
  /** ISO timestamp. */
  createdAt: string;
};

/** `GET /api/recipes/meal-plan/:id`: everything the cooking view (and the assistant) needs. */
export type CookingState = {
  entry: MealPlanEntry;
  recipe: {
    id: string;
    name: string;
    servings: number | null;
    coverFileId: string | null;
    steps: RecipeStep[];
  };
  ingredients: CookingIngredient[];
  extras: CookingIngredient[];
  /** Newest first. */
  usages: CookUsage[];
};

/** `POST /api/recipes/meal-plan/:id/use`. */
export type CookUseResult = {
  state: CookingState;
  usageId: string;
  addedToShoppingList: boolean;
};

/** `POST /api/recipes/meal-plan`. */
export type PlanResult = {
  entry: MealPlanEntry;
  added: number;
  merged: number;
};

// ── Cooking helpers (UI) ──────────────────────────────────────────────────────────────────────────────

/** How many ingredients were used at least once (for the tray's button). */
export const usedCount = (items: readonly CookingIngredient[]) => items.filter((item) => item.used > 0).length;

/** What was used, summed per ingredient (taps that were undone left out), in stock units and the recipe's unit. */
export function usageSummary(usages: readonly CookUsage[]) {
  type Total = { name: string; unit: string | null; quantity: number; recipeQuantity: { amount: number; unit: string } | null };
  const totals = new Map<string, Total>();
  for (const usage of usages) {
    if (usage.undone) continue;
    const key = `${usage.kind}-${usage.refId ?? usage.name}`;
    const total = totals.get(key) ?? { name: usage.name, unit: usage.unit, quantity: 0, recipeQuantity: null };
    total.quantity = round3(total.quantity + usage.quantity);
    if (usage.recipeQuantity) {
      total.recipeQuantity = { unit: usage.recipeQuantity.unit, amount: round3((total.recipeQuantity?.amount ?? 0) + usage.recipeQuantity.amount) };
    }
    totals.set(key, total);
  }
  return [...totals.values()];
}
