import { z } from "zod";
import {
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_IMPORT_BATCH,
  recipeImportItemSchema,
  recipeInputSchema,
  recipeCategoryInputSchema,
  timerFromText,
  usageSummary,
  type CookingIngredient,
  type CookingState,
  type Recipe,
  type RecipeInput,
} from "@/features/recipes/types/recipes";
import { formatQuantity } from "@/features/shopping/types/shopping";
import { HttpError, badRequest, forbidden } from "@/api/lib/http";
import { listStock } from "@/api/inventory/inventory.service";
import {
  addExtra,
  checkRecipe,
  createRecipe,
  getCookingState,
  getRecipe,
  listCookingEntries,
  listMealPlan,
  listRecipes,
  markCooked,
  planRecipe,
  setStep,
  updateRecipe,
  useIngredient,
} from "@/api/recipes/recipes.service";
import { listProducts } from "@/api/shopping/shopping.service";
import { deleteRecipeCategory, listRecipeCategories, saveRecipeCategory } from "@/api/recipes/recipe-categories.service";
import { importRecipes } from "@/api/recipes/recipe-import.service";
import { packageSizeFromName } from "@/api/shopping/barcode-lookup";
import { listIngredientSearchShops } from "@/api/shops/shops.service";
import { isWebSearchConfigured, readPage, searchWeb, WebPageError, WebSearchError, type WebPage } from "@/api/web/web.service";
import { fold } from "@ai/core/text-match";
import {
  capList,
  done,
  entityRef,
  money,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  registerScreenContext,
  say,
  screenTarget,
  type AssistantPreview,
  type AssistantToolContext,
  type ResolvedEntity,
} from "@ai/core/kit";
import { UNTRUSTED_NOTE } from "../web/tools";
import { ingredientName, matchIngredients, pickByName } from "./match";
import { applyOfferTo, createProductFromOffer } from "./offer-products";
import { getOffer, rememberOffer, type Offer } from "./offers";

/**
 * Skill "recipes": recipes from a link, pasted text or a photo, matched to the household's products; the "To
 * cook" list; and cooking ("I used 1 more garlic", "what's the next step"). Guide: guide.md next to this file;
 * the feature: docs/RECIPES.md. Pasted text and photos are read by the chat model itself (no model call inside a
 * tool), which then calls recipes_match and recipes_save. Unknown ingredients are searched only on the shops the
 * household switched on for ingredient search (Shops → a shop → "Use for ingredient search").
 */

registerAssistantSkill({
  id: "recipes",
  title: { en: "Recipes", nl: "Recepten" },
  summary:
    "Recipes and cooking: read a recipe from a link, text or photo, match ingredients to products, save it, plan it (To cook + missing items on the list), record what was used while cooking, steps.",
  keywords: {
    nl: ["recept", "recepten", "koken", "kook", "kookt", "ingrediënt", "ingrediënten", "gerecht", "gerechten", "menu", "kookboek", "te koken", "aan het koken"],
    en: ["recipe", "recipes", "cook", "cooking", "ingredient", "ingredients", "dish", "menu", "cookbook", "to cook"],
  },
});

const LIST_LIMIT = 25;

const amountText = (value: number, unit: string | null, locale: "en" | "nl") => `${formatQuantity(value, locale)}${unit ? ` ${unit}` : ""}`;

registerEntityResolver({
  type: "recipe",
  label: "recipe",
  skill: "recipes",
  list: async (ctx) => (await listRecipes(ctx.householdId)).map((recipe) => ({ id: recipe.id, name: recipe.name, aliases: [] })),
});

registerEntityResolver({
  type: "recipe_category",
  label: "recipe category",
  skill: "recipes",
  list: async (ctx) => (await listRecipeCategories(ctx.householdId)).map((category) => ({ id: category.id, name: category.name })),
});

registerEntityResolver({
  type: "meal",
  label: "meal on the To cook list",
  skill: "recipes",
  searchable: false,
  list: async (ctx) =>
    (await listMealPlan(ctx.householdId)).map((entry) => ({ id: entry.id, name: entry.recipeName, hint: entry.status === "cooking" ? "being cooked" : "to cook" })),
});

// ── Which meal ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The meal a cooking tool is about: the one named, else the cooking screen's, else the one being cooked of the
 * recipe on screen, else the only one being cooked; otherwise a question for the model.
 */
async function mealId(ctx: AssistantToolContext, meal: ResolvedEntity | undefined): Promise<string> {
  if (meal) return meal.id;
  const onScreen = screenTarget(ctx, "cooking");
  if (onScreen) return onScreen;
  const busy = await listCookingEntries(ctx.householdId);
  const recipeOnScreen = screenTarget(ctx, "recipe");
  const ofRecipe = recipeOnScreen ? busy.find((entry) => entry.recipeId === recipeOnScreen) : undefined;
  if (ofRecipe) return ofRecipe.id;
  if (busy.length === 1) return busy[0]!.id;
  if (!busy.length) throw badRequest("Nothing is being cooked right now. Ask which meal, or start cooking it in the app (Recipes → To cook → Start cooking).");
  throw badRequest(`Several meals are being cooked: ${busy.map((entry) => `"${entry.recipeName}"`).join(" or ")}. Ask which one, then pass meal.`);
}

/** The recipe a tool is about: the one named, else the recipe or cooking screen's recipe; otherwise a question. */
async function recipeId(ctx: AssistantToolContext, recipe: ResolvedEntity | undefined): Promise<string> {
  if (recipe) return recipe.id;
  const onScreen = screenTarget(ctx, "recipe");
  if (onScreen) return onScreen;
  const cooking = screenTarget(ctx, "cooking");
  if (cooking) return (await getCookingState(ctx.householdId, cooking)).recipe.id;
  throw badRequest("Which recipe? Ask the person, or call recipes_list.");
}

const mealInput = entityRef("meal", "The meal being cooked (recipe name); leave out on the cooking screen or when only one is being cooked").optional();

/** Taps are in the product's stock unit (packs); the recipe's own amount may be another unit (300 g). */
const stockUnitOf = (item: CookingIngredient) => (item.product ? item.product.unit : item.unit);

/** A cooking ingredient as the model reads it: "Emmental: used 1,5 pak (300 g) of 300 g, 0,5 pak in stock". */
function cookingLine(item: CookingIngredient, locale: "en" | "nl") {
  const needed = item.needed === null ? "" : ` of ${amountText(item.needed, item.unit, locale)}`;
  const inRecipe = item.usedInRecipeUnit !== null && item.unit && item.unit !== stockUnitOf(item) ? ` (${amountText(item.usedInRecipeUnit, item.unit, locale)})` : "";
  const stock = item.stock === null ? "" : `, ${amountText(item.stock, stockUnitOf(item), locale)} in stock`;
  return `${item.name}: used ${amountText(item.used, stockUnitOf(item), locale)}${inRecipe}${needed}${stock}${item.note ? ` (${item.note})` : ""}`;
}

const stepText = (state: CookingState, index: number) => state.recipe.steps[index]?.text ?? null;

// ── Reading a recipe ──────────────────────────────────────────────────────────────────────────────────

function webFailure(error: unknown): never {
  if (error instanceof WebSearchError) throw new HttpError(502, "web_search", error.message);
  if (error instanceof WebPageError) {
    if (error.code === "unsafe_url" || error.code === "blocked_address") throw badRequest(error.message);
    throw new HttpError(502, "web_read", error.message);
  }
  throw error;
}

registerAssistantTool({
  name: "recipes.read_link",
  description:
    "Read a recipe from a web link: name, servings, original imageUrl, ingredient lines and steps (or the page text when the site has no recipe data). Then recipes_match the ingredients and pass imageUrl to recipes_save.",
  input: z.object({ url: z.url({ protocol: /^https?$/ }).max(2000).describe("The recipe page's full link") }),
  permission: "read",
  confirm: "never",
  available: () => isWebSearchConfigured(),
  activity: { en: "Read a recipe", nl: "Recept gelezen" },
  run: async (ctx, input) => {
    const page = await readPage(input.url, { signal: ctx.signal }).catch(webFailure);
    const recipe = page.recipe;
    if (recipe?.ingredients.length) {
      return {
        untrusted: true,
        note: UNTRUSTED_NOTE,
        url: page.url,
        name: recipe.name ?? page.title,
        imageUrl: recipe.imageUrl,
        servings: recipe.servings,
        yield: recipe.servings === null ? recipe.yield : null,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        moreSteps: recipe.stepsCut || null,
        // Be honest about the steps: from the page when the structured data cut them off, or still incomplete.
        stepsSource: recipe.stepsSource,
        stepsNote:
          recipe.stepsSource === "page"
            ? `The page's structured data had fewer steps; these ${recipe.steps.length} were taken from the page itself. Say so.`
            : recipe.stepsIncomplete
              ? "The structured data seems to cut the steps off and the page showed no more: say the steps may be incomplete (see the page), never that the recipe has only these steps."
              : null,
      };
    }
    // No recipe data: the model reads the ingredients and steps from the text itself.
    return {
      untrusted: true,
      note: UNTRUSTED_NOTE,
      url: page.url,
      title: page.title,
      imageUrl: page.imageUrl,
      problem: page.note ?? "No structured recipe on this page: read the ingredients and steps from the text below.",
      text: page.text || null,
      more: page.textCut || null,
    };
  },
});

/** Total stock per main product (stock always belongs to a group's main product). */
async function stockByProduct(householdId: string): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  for (const item of await listStock(householdId)) totals.set(item.productId, Math.round(((totals.get(item.productId) ?? 0) + item.quantity) * 1000) / 1000);
  return totals;
}

const ingredientLines = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120).describe("The ingredient without the amount, e.g. 'look'"),
      amount: z.string().trim().max(60).optional().describe("The recipe's amount as written, e.g. '2 teentjes'"),
      quantity: z.number().positive().max(100_000).optional().describe("The recipe's own amount, e.g. 300 for '300 g' (default: read from amount)"),
      unit: z.string().trim().max(20).optional().describe("The recipe's unit, e.g. 'g', 'ml', 'stuk', 'el'"),
    }),
  )
  .min(1)
  .max(MAX_RECIPE_INGREDIENTS);

registerAssistantTool({
  name: "recipes.match",
  description:
    "Match recipe ingredients to the household's products: per line the product, its stock and what's short; 'unknown' = no product yet (recipes_find_product, then inventory_save_product).",
  input: z.object({ ingredients: ingredientLines }),
  permission: "read",
  confirm: "never",
  activity: { en: "Matched the ingredients", nl: "Ingrediënten vergeleken" },
  run: async (ctx, input) => {
    const [products, stock] = await Promise.all([listProducts(ctx.householdId), stockByProduct(ctx.householdId)]);
    const matches = matchIngredients(input.ingredients, products, stock);
    return {
      ingredients: matches.map((match) => ({
        name: match.name,
        amount: match.amount,
        product: match.product?.name ?? null,
        maybe: match.maybe.length ? match.maybe : null,
        stock: match.stock === null ? null : amountText(match.stock, match.unit, ctx.locale),
        status: match.status,
        // Packs to buy; null when it can't be said (unknown_amount: the product has no content per package).
        buy: match.product && match.shortfall ? amountText(match.shortfall, match.unit, ctx.locale) : null,
      })),
      unknown: matches.filter((match) => match.status === "unknown").length || null,
    };
  },
});

// ── Webshops: ingredients the household has no product for ──────────────────────────────────────────

const SHOPS_TO_SEARCH = 4;
const PAGES_TO_READ = 3;
const ENOUGH_HITS = 2;

type Found = { offer: string; shop: string; name: string; price: string | null; availability: string | null; url: string; image: boolean };

/**
 * A product page found at a shop, remembered as an offer (offers.ts): the model passes `offer` to
 * inventory_save_product / recipes_save, and the link, price, photo and package size are copied server-side.
 */
function foundFrom(householdId: string, page: WebPage, shop: { id: string; name: string }): Found | null {
  if (!page.product?.name) return null;
  const priceCents = page.product.price === null ? null : Math.round(page.product.price * 100);
  const size = packageSizeFromName(page.product.name);
  const offer = rememberOffer(householdId, {
    shopId: shop.id,
    shopName: shop.name,
    name: page.product.name.slice(0, 120),
    url: page.url,
    priceCents,
    imageUrl: page.product.imageUrl,
    packageAmount: size?.amount ?? null,
    packageUnit: size?.unit ?? null,
  });
  return {
    offer,
    shop: shop.name,
    name: page.product.name,
    price: priceCents === null ? null : money(priceCents),
    availability: page.product.availability,
    url: page.url,
    image: Boolean(page.product.imageUrl),
  };
}

registerAssistantTool({
  name: "recipes.find_product",
  description:
    "Search the household's chosen grocery webshops (only those switched on for ingredient search) for an ingredient: product name, price, shop, link and an `offer` id; pass `offer` to inventory_save_product or recipes_save so the link, price and photo are stored.",
  input: z.object({
    ingredient: z.string().trim().min(2).max(80).describe("Generic search words, e.g. 'verse basilicum'; never household data"),
  }),
  permission: "read",
  confirm: "never",
  available: () => isWebSearchConfigured(),
  activity: { en: "Searched the webshops", nl: "In de webshops gezocht" },
  run: async (ctx, input) => {
    const shops = await listIngredientSearchShops(ctx.householdId);
    if (!shops.length) {
      return {
        found: [],
        problem:
          "No webshops are switched on for ingredient search, so nothing was searched. Tell the person: in the app go to Shops, open a shop with a webshop and switch on 'Use for ingredient search' (Winkels → winkel → 'Gebruiken om ingrediënten te zoeken').",
      };
    }
    const query = ingredientName(input.ingredient);
    const found: Found[] = [];
    const searched: string[] = [];
    const failed: string[] = [];
    let reads = 0;
    for (const shop of shops.slice(0, SHOPS_TO_SEARCH)) {
      if (found.length >= ENOUGH_HITS || ctx.signal.aborted) break;
      searched.push(shop.name);
      let results: Awaited<ReturnType<typeof searchWeb>>["results"];
      try {
        results = (await searchWeb(query, { site: shop.domain, limit: 3, signal: ctx.signal })).results;
      } catch (error) {
        if (error instanceof WebSearchError && error.code === "not_configured") throw new HttpError(502, "web_search", error.message);
        failed.push(shop.name);
        continue;
      }
      // The best one or two product pages of this shop: the price and name come from the page, never the snippet.
      for (const result of results.slice(0, 2)) {
        if (reads >= PAGES_TO_READ || found.length >= ENOUGH_HITS) break;
        reads += 1;
        const page = await readPage(result.url, { signal: ctx.signal }).catch(() => null);
        const hit = page && foundFrom(ctx.householdId, page, shop);
        if (hit) found.push(hit);
      }
    }
    return {
      untrusted: true,
      note: UNTRUSTED_NOTE,
      searched,
      found,
      problem: found.length
        ? null
        : `Nothing found for "${query}" at ${searched.join(", ")}${failed.length ? ` (${failed.join(", ")} did not answer)` : ""}. Say so; never invent a product or price.`,
    };
  },
});

// ── Recipes and the "To cook" list ──────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "recipes.categories",
  description: "List the household's recipe categories with recipe counts, including how many recipes have no category.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked recipe categories", nl: "Receptcategorieën bekeken" },
  run: async (ctx) => {
    const [categories, uncategorized] = await Promise.all([listRecipeCategories(ctx.householdId), listRecipes(ctx.householdId, { categoryId: "none" })]);
    return { categories, uncategorized: uncategorized.length };
  },
});

registerAssistantTool({
  name: "recipes.save_category",
  description: "Create a recipe category, or rename one. Categories are shared by the household. Then use category in recipes_save to assign recipes.",
  input: z.object({ category: entityRef("recipe_category", "Existing category to rename; omit to create").optional(), name: recipeCategoryInputSchema.shape.name }),
  permission: "write",
  confirm: "always",
  activity: { en: "Saved a recipe category", nl: "Receptcategorie bewaard" },
  describe: (ctx, input) => input.category
    ? say(ctx.locale, `Rename recipe category ${input.category.name} to ${input.name}`, `Receptcategorie ${input.category.name} hernoemen naar ${input.name}`)
    : say(ctx.locale, `Create recipe category ${input.name}`, `Receptcategorie ${input.name} aanmaken`),
  run: async (ctx, input) => {
    const category = await saveRecipeCategory(ctx.householdId, { name: input.name }, input.category?.id);
    return done(`Saved recipe category ${category.name}.`, { id: category.id, name: category.name });
  },
});

registerAssistantTool({
  name: "recipes.delete_category",
  description: "Delete a recipe category. Its recipes are kept and become uncategorized.",
  input: z.object({ category: entityRef("recipe_category", "The category to remove") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a recipe category", nl: "Receptcategorie verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete category ${input.category.name}; keep its recipes`, `Categorie ${input.category.name} verwijderen; recepten behouden`),
  run: async (ctx, input) => {
    await deleteRecipeCategory(ctx.householdId, input.category.id);
    return done(`Deleted category ${input.category.name}; its recipes are kept without a category.`);
  },
});

registerAssistantTool({
  name: "recipes.list",
  description:
    "The household's recipes and the To cook list (meals planned and being cooked). Give a recipe for its ingredients with stock (in stock / short / unknown) and steps.",
  input: z.object({
    recipe: entityRef("recipe", "One recipe's details; leave out for the list (on a recipe's page: that one)").optional(),
    q: z.string().trim().max(80).optional().describe("Part of a recipe name or ingredient"),
    servings: z.number().int().min(1).max(100).optional().describe("Check the stock for this many people"),
    category: entityRef("recipe_category", "Only recipes in this category (recipes_categories lists them)").optional(),
    uncategorized: z.boolean().optional().describe("Only recipes without a category"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the recipes", nl: "Recepten bekeken" },
  run: async (ctx, input) => {
    if (input.category && input.uncategorized) throw badRequest("Choose a category or uncategorized, not both.");
    const id = input.recipe?.id ?? (input.q || input.category || input.uncategorized ? undefined : screenTarget(ctx, "recipe"));
    if (id) {
      const [recipe, check] = await Promise.all([getRecipe(ctx.householdId, id), checkRecipe(ctx.householdId, id, input.servings)]);
      return {
        name: recipe.name,
        category: recipe.category?.name ?? null,
        servings: check.servings,
        source: recipe.sourceUrl,
        imageUrl: recipe.imageUrl,
        ingredients: check.ingredients.map((item) => ({
          name: item.name,
          product: item.productName,
          need: amountText(item.needed, item.unit, ctx.locale),
          stock: item.stock === null ? null : amountText(item.stock, item.product?.unit ?? null, ctx.locale),
          note: item.note,
          optional: item.optional || null,
          status: item.status,
          // In packs (the stock unit); null when the units don't convert (unknown_amount).
          buy: item.shortfallPackages ? amountText(item.shortfallPackages, item.product?.unit ?? null, ctx.locale) : !item.product && item.status === "unknown" ? amountText(item.needed, item.unit, ctx.locale) : null,
          onList: item.onList || null,
        })),
        steps: recipe.steps.length,
      };
    }
    const [recipes, meals] = await Promise.all([listRecipes(ctx.householdId, { q: input.q, categoryId: input.uncategorized ? "none" : input.category?.id }), listMealPlan(ctx.householdId)]);
    return {
      toCook: meals.map((meal) => `${meal.recipeName} (${meal.servings} p., ${meal.status === "cooking" ? `being cooked, step ${meal.currentStep + 1}/${meal.stepCount}` : "to cook"})`),
      count: recipes.length,
      ...capList(recipes, LIST_LIMIT, (recipe) => ({ name: recipe.name, category: recipe.category?.name ?? null, servings: recipe.servings, imageUrl: recipe.imageUrl, ingredients: recipe.ingredientCount })),
    };
  },
});

const saveIngredient = z.object({
  name: z.string().trim().min(1).max(120).describe("The ingredient, e.g. 'look'"),
  product: entityRef("product", "The household product it is (from recipes_match); leave out when unknown").optional(),
  offer: z.string().trim().max(20).optional().describe("An `offer` from recipes_find_product: makes (or links) the product with its webshop link, price and photo"),
  quantity: z.number().positive().max(100_000).optional().describe("The recipe's own amount for its servings, e.g. 300 for '300 g'"),
  unit: z.string().trim().max(20).optional().describe("The recipe's unit as written: 'g', 'ml', 'stuk', 'el', 'teentjes'"),
  note: z.string().trim().max(200).optional().describe("Anything else, e.g. 'geperst', 'geraspt'"),
  optional: z.boolean().optional(),
});
type SaveIngredient = z.output<typeof saveIngredient>;

registerAssistantTool({
  name: "recipes.import_batch",
  description: "Import up to 25 recipes atomically, deduplicated by sourceUrl. Send name, imageUrl, servings, ingredients and steps ({text,timerMinutes?}) for new recipes. An existing sourceUrl only gets the supplied category; its content is preserved even if content is sent. A sourceUrl alone can categorize an existing recipe. Safe to retry. Create categories with recipes_save_category first; category on an item overrides the batch category.",
  input: z.object({
    category: entityRef("recipe_category", "Category for the batch; omit to preserve existing categories").optional(),
    recipes: z.array(recipeImportItemSchema.omit({ categoryId: true, ingredients: true }).extend({
      category: entityRef("recipe_category", "Overrides the batch category for this recipe").optional(),
      ingredients: z.array(saveIngredient.omit({ offer: true })).max(MAX_RECIPE_INGREDIENTS).optional(),
    })).min(1).max(MAX_RECIPE_IMPORT_BATCH),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Imported recipes", nl: "Recepten geïmporteerd" },
  describe: (ctx, input) => say(ctx.locale,
    `Import ${input.recipes.length} recipe(s)${input.category ? ` into ${input.category.name}` : ""}; existing recipe content is preserved`,
    `${input.recipes.length} recept(en) importeren${input.category ? ` in ${input.category.name}` : ""}; de inhoud van bestaande recepten blijft behouden`),
  run: async (ctx, input) => importRecipes(ctx.user, {
    categoryId: input.category?.id,
    recipes: input.recipes.map(({ category, ingredients, ...recipe }) => ({
      ...recipe,
      categoryId: category?.id,
      ingredients: ingredients?.map(({ product, ...ingredient }) => ({ ...ingredient, productId: product?.id, optional: ingredient.optional ?? false })),
    })),
  }, ctx.signal),
});

const saveInput = z.object({
  recipe: entityRef("recipe", "An existing recipe to change; leave out to add a new one").optional(),
  name: z.string().trim().min(1).max(120).optional().describe("Required for a new recipe"),
  servings: z.number().int().min(1).max(100).optional(),
  category: entityRef("recipe_category", "Recipe category; create one with recipes_save_category first").optional(),
  noCategory: z.boolean().optional().describe("Remove the recipe's category"),
  sourceUrl: z.url({ protocol: /^https?$/ }).max(1000).optional(),
  imageUrl: recipeInputSchema.shape.imageUrl.describe("Original recipe photo URL from recipes_read_link; null removes it"),
  ingredients: z.array(saveIngredient).max(MAX_RECIPE_INGREDIENTS).optional().describe("Existing recipe: these are added, or update the ingredient of the same name"),
  steps: z.array(z.string().trim().min(1).max(2000)).max(MAX_RECIPE_STEPS).optional().describe("One text per step; replaces the steps"),
  notes: z.string().trim().max(4000).optional(),
});
type SaveArgs = z.output<typeof saveInput>;

/** The recipe input a save makes: a new recipe, or the existing one with the given fields and ingredients merged in. */
function recipeInputFor(args: SaveArgs, current: Recipe | null): RecipeInput {
  const toInput = (item: SaveIngredient, existing?: Recipe["ingredients"][number]) => ({
    id: existing?.id ?? null,
    productId: item.product?.id ?? existing?.productId ?? null,
    name: item.name,
    quantity: item.quantity ?? existing?.quantity ?? null,
    unit: item.unit ?? existing?.unit ?? null,
    note: item.note ?? existing?.note ?? null,
    optional: item.optional ?? existing?.optional ?? false,
  });
  const given = args.ingredients ?? [];
  const kept = (current?.ingredients ?? []).map((existing) => {
    const update = given.find((item) => fold(item.name) === fold(existing.name));
    return update ? toInput(update, existing) : { ...existing, id: existing.id };
  });
  const added = given.filter((item) => !current?.ingredients.some((existing) => fold(existing.name) === fold(item.name))).map((item) => toInput(item));
  const steps = args.steps ? args.steps.map((text) => ({ text, timerMinutes: timerFromText(text) })) : (current?.steps ?? []).map((step) => ({ text: step.text, timerMinutes: step.timerMinutes }));
  return {
    name: args.name ?? current?.name ?? "",
    categoryId: args.noCategory ? null : args.category?.id ?? current?.category?.id ?? null,
    servings: args.servings ?? current?.servings ?? null,
    sourceUrl: args.sourceUrl ?? current?.sourceUrl ?? null,
    imageUrl: args.imageUrl !== undefined ? args.imageUrl : current?.imageUrl ?? null,
    notes: args.notes ?? current?.notes ?? null,
    ingredients: [...kept, ...added].map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      note: item.note,
      optional: item.optional,
    })),
    steps,
  };
}

const ingredientDetail = (item: SaveIngredient, offer: Offer | null, locale: "en" | "nl") =>
  [
    item.product
      ? `→ ${item.product.name}`
      : offer
        ? say(locale, `→ new product ${offer.name}`, `→ nieuw product ${offer.name}`)
        : say(locale, "no product", "geen product"),
    offer ? `${offer.shopName}${offer.priceCents !== null ? ` ${money(offer.priceCents)}` : ""} · ${offer.url}` : null,
    item.quantity ? amountText(item.quantity, item.unit ?? null, locale) : null,
    item.note,
  ]
    .filter(Boolean)
    .join(" · ");

registerAssistantTool({
  name: "recipes.save",
  description:
    "Save a recipe (new, or change one): name, servings, source link, imageUrl (the original recipe photo), ingredients (each linked to a product from recipes_match where known) and steps. On an existing recipe, ingredients are added or update the one of the same name (e.g. link a product).",
  input: saveInput,
  permission: "write",
  confirm: "always",
  activity: { en: "Saved a recipe", nl: "Recept bewaard" },
  describe: (ctx, input) => {
    const name = input.recipe?.name ?? input.name ?? "?";
    const count = input.ingredients?.length ?? 0;
    return input.recipe
      ? say(ctx.locale, `Change the recipe ${name}${count ? ` (${count} ingredients)` : ""}`, `Recept ${name} aanpassen${count ? ` (${count} ingrediënten)` : ""}`)
      : say(ctx.locale, `Save the recipe ${name} (${count} ingredients, ${input.steps?.length ?? 0} steps)`, `Recept ${name} bewaren (${count} ingrediënten, ${input.steps?.length ?? 0} stappen)`);
  },
  preview: (ctx, input): AssistantPreview | null => {
    if (!input.ingredients?.length) return null;
    return {
      kind: "list",
      title: say(ctx.locale, "Ingredients", "Ingrediënten"),
      data: {
        items: input.ingredients.map((item) => {
          const offer = item.offer ? getOffer(ctx.householdId, item.offer) : null;
          return { label: item.name, detail: ingredientDetail(item, offer, ctx.locale), tone: item.product || offer ? ("add" as const) : ("change" as const) };
        }),
      },
    };
  },
  run: async (ctx, input) => {
    const current = input.recipe ? await getRecipe(ctx.householdId, input.recipe.id) : null;
    if (input.category && input.noCategory) throw badRequest("Choose a category or noCategory, not both.");
    if (!current && !input.name) throw badRequest("A new recipe needs a name.");
    // Offers from recipes_find_product: a new product (or the given one) gets the link, price and photo, copied here.
    const offers = (input.ingredients ?? []).map((item) => (item.offer ? (getOffer(ctx.householdId, item.offer) ?? item.offer) : null));
    const expired = offers.find((offer): offer is string => typeof offer === "string");
    if (expired) throw badRequest(`Offer ${expired} is unknown or expired: run recipes_find_product again and use its offer.`);
    const ingredients = await Promise.all(
      (input.ingredients ?? []).map(async (item, index) => {
        const offer = offers[index] as Offer | null;
        if (!offer) return item;
        const product = item.product ? await applyOfferTo(ctx.householdId, item.product.id, offer) : await createProductFromOffer(ctx.householdId, offer);
        return { ...item, product: { id: product.id, name: product.name } as ResolvedEntity };
      }),
    );
    const data = recipeInputFor({ ...input, ingredients: input.ingredients ? ingredients : undefined }, current);
    const recipe = current ? await updateRecipe(ctx.householdId, current.id, data) : await createRecipe(ctx.user, data);
    const free = recipe.ingredients.filter((item) => !item.productId).length;
    return done(
      `${current ? "Saved" : "Added"} the recipe ${recipe.name}: ${recipe.ingredients.length} ingredients${free ? ` (${free} without a product)` : ""}, ${recipe.steps.length} steps.`,
      { id: recipe.id },
    );
  },
});

registerAssistantTool({
  name: "recipes.plan",
  description:
    "Put a recipe on the To cook list for a number of people and the missing ingredients on the shopping list (in stock or already on the list: skipped).",
  input: z.object({
    recipe: entityRef("recipe", "The recipe; leave out on its page").optional(),
    servings: z.number().int().min(1).max(100).optional().describe("For how many people (default the recipe's)"),
    buy: z.enum(["missing", "none"]).default("missing").describe("none = only put it on To cook"),
    skip: z.array(z.string().trim().min(1).max(120)).max(30).optional().describe("Ingredient names not to buy"),
  }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Planned a meal", nl: "Maaltijd gepland" },
  describe: async (ctx, input) => {
    const id = await recipeId(ctx, input.recipe);
    const name = input.recipe?.name ?? (await getRecipe(ctx.householdId, id)).name;
    const people = input.servings ? say(ctx.locale, ` for ${input.servings}`, ` voor ${input.servings}`) : "";
    return say(ctx.locale, `Put ${name}${people} on To cook`, `${name}${people} op Te koken zetten`);
  },
  preview: async (ctx, input) => {
    if (input.buy === "none") return null;
    const items = await toBuy(ctx, input);
    return {
      kind: "list",
      title: say(ctx.locale, items.length ? "On the shopping list" : "Everything is in stock", items.length ? "Op de boodschappenlijst" : "Alles is in voorraad"),
      data: {
        items: items.map((item) => ({
          label: item.productName ?? item.name,
          detail: item.product
            ? amountText(Math.ceil(item.shortfallPackages || item.neededInStockUnits || 1), item.product.unit, ctx.locale)
            : amountText(item.needed, item.unit, ctx.locale),
          tone: "add" as const,
        })),
      },
    };
  },
  run: async (ctx, input) => {
    const id = await recipeId(ctx, input.recipe);
    const check = await checkRecipe(ctx.householdId, id, input.servings);
    const items = input.buy === "none" ? [] : await toBuy(ctx, input);
    const result = await planRecipe(ctx.user, { recipeId: id, servings: check.servings, items: items.map((item) => ({ ingredientId: item.ingredientId })) });
    const listed = result.added + result.merged;
    return done(
      `${result.entry.recipeName} is on To cook for ${result.entry.servings}.${listed ? ` ${listed} ingredient(s) on the shopping list${result.merged ? ` (${result.merged} added to an item already there)` : ""}.` : " Nothing needed buying."}`,
      { id: result.entry.id },
    );
  },
});

/** What planning buys: short or unknown, not optional, not on a list yet, not skipped. */
async function toBuy(ctx: AssistantToolContext, input: { recipe?: ResolvedEntity; servings?: number; skip?: string[] }) {
  const check = await checkRecipe(ctx.householdId, await recipeId(ctx, input.recipe), input.servings);
  const skipped = (input.skip ?? []).map((name) => fold(ingredientName(name)));
  return check.ingredients.filter(
    (item) =>
      item.status !== "in_stock" &&
      !item.optional &&
      !item.onList &&
      !skipped.some((name) => fold(item.name).includes(name) || (item.productName && fold(item.productName).includes(name))),
  );
}

// ── Cooking ─────────────────────────────────────────────────────────────────────────────────────────

/** What "I used X" means in this meal: an ingredient or extra by name, else a household product (it becomes an extra). */
async function usedTarget(ctx: AssistantToolContext, state: CookingState, name: string) {
  const items = [...state.ingredients, ...state.extras];
  const item = pickByName(items, name);
  if (item) return { item, product: null };
  const products = await listProducts(ctx.householdId);
  const product = pickByName(products, name);
  if (product) return { item: null, product };
  throw badRequest(
    `"${name}" is not in ${state.recipe.name} (ingredients: ${items.map((entry) => entry.name).join(", ")}) and is no product. Use one of those names, or recipes_add_ingredient.`,
  );
}

/** How much a "used" means: as said, else one tap's amount (in packs); refused when the recipe's unit doesn't convert. */
function usedQuantity(input: { quantity?: number }, target: Awaited<ReturnType<typeof usedTarget>>): number {
  if (input.quantity) return input.quantity;
  if (!target.item) return 1;
  if (target.item.tapAmount !== null) return target.item.tapAmount;
  throw badRequest(
    `${target.item.name}: the recipe's ${target.item.needed ?? ""} ${target.item.unit ?? ""} doesn't convert to its stock unit (${stockUnitOf(target.item) ?? "pieces"}). Ask how much, in that unit.`,
  );
}

registerAssistantTool({
  name: "recipes.use",
  description:
    "While cooking: record that an ingredient was used ('ik heb nog 1 look extra gebruikt'); takes it out of stock. An ingredient of the recipe, or any product (then added as an extra). Can be repeated.",
  input: z.object({
    ingredient: z.string().trim().min(1).max(120).describe("Its name, e.g. 'look'"),
    quantity: z.number().positive().max(100_000).optional().describe("How much (default the planned amount, or 1)"),
    unit: z.string().trim().max(20).optional().describe("The unit of quantity, e.g. 'g'; leave out for packs/pieces"),
    meal: mealInput,
  }),
  permission: "write",
  confirm: "first-time",
  // Cooking is for everyone, as in the app (children tap "Used" too).
  roles: ["owner", "adult", "child"],
  activity: { en: "Recorded what was used", nl: "Gebruik genoteerd" },
  describe: async (ctx, input) => {
    const state = await getCookingState(ctx.householdId, await mealId(ctx, input.meal));
    const target = await usedTarget(ctx, state, input.ingredient);
    const name = target.item?.name ?? target.product?.name ?? input.ingredient;
    const quantity = usedQuantity(input, target);
    const amount = amountText(quantity, input.quantity && input.unit ? input.unit : target.item ? stockUnitOf(target.item) : (target.product?.unit ?? null), ctx.locale);
    return say(ctx.locale, `Used ${amount} ${name} for ${state.recipe.name}`, `${amount} ${name} gebruikt voor ${state.recipe.name}`);
  },
  run: async (ctx, input) => {
    const id = await mealId(ctx, input.meal);
    const state = await getCookingState(ctx.householdId, id);
    const target = await usedTarget(ctx, state, input.ingredient);
    const quantity = usedQuantity(input, target);
    const ref = target.item
      ? target.item.kind === "ingredient"
        ? { ingredientId: target.item.id }
        : { extraId: target.item.id }
      : { productId: target.product!.id };
    const result = await useIngredient(ctx.user, id, { ...ref, quantity, unit: input.quantity ? input.unit : null });
    const after = [...result.state.ingredients, ...result.state.extras].find((item) => (target.item ? item.id === target.item.id : item.productId === target.product?.id));
    const low = result.addedToShoppingList ? " Running low: it is on the shopping list now." : "";
    return done(`${after ? cookingLine(after, ctx.locale) : `Used ${formatQuantity(quantity, ctx.locale)} ${input.ingredient}`}.${low}`);
  },
});

const CHILD_RECIPE_RULE = "Only adults change recipes; children can add an ingredient to this meal only (saveToRecipe off).";

registerAssistantTool({
  name: "recipes.add_ingredient",
  description:
    "While cooking: add an ingredient that isn't in the recipe (a product or free text), used right away by default; saveToRecipe also adds it to the recipe for next time.",
  input: z.object({
    product: entityRef("product", "The household product, when it is one").optional(),
    name: z.string().trim().min(1).max(120).optional().describe("Free text when it is no product"),
    quantity: z.number().positive().max(1000).optional(),
    unit: z.string().trim().max(20).optional(),
    use: z.boolean().default(true).describe("Also record it as used (takes it out of stock)"),
    saveToRecipe: z.boolean().default(false),
    meal: mealInput,
  }),
  permission: "write",
  confirm: "first-time",
  roles: ["owner", "adult", "child"],
  refuse: (ctx, input) => (input.saveToRecipe && ctx.user.role === "child" ? CHILD_RECIPE_RULE : null),
  activity: { en: "Added an ingredient", nl: "Ingrediënt toegevoegd" },
  describe: (ctx, input) => {
    const name = input.product?.name ?? input.name ?? "?";
    const extra = input.saveToRecipe ? say(ctx.locale, " (also in the recipe)", " (ook in het recept)") : "";
    return say(ctx.locale, `Add ${name} to this meal${extra}`, `${name} toevoegen aan deze maaltijd${extra}`);
  },
  run: async (ctx, input) => {
    if (input.saveToRecipe && ctx.user.role === "child") throw forbidden(CHILD_RECIPE_RULE);
    if (!input.product && !input.name) throw badRequest("Give a product or a name.");
    const id = await mealId(ctx, input.meal);
    const state = await addExtra(ctx.user, id, {
      productId: input.product?.id ?? null,
      name: input.name ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      saveToRecipe: input.saveToRecipe,
      use: input.use,
    });
    const name = input.product?.name ?? input.name ?? "";
    return done(`Added ${name} to ${state.recipe.name}${input.use ? " and recorded it as used" : ""}${input.saveToRecipe ? "; it is in the recipe now" : ""}.`);
  },
});

registerAssistantTool({
  name: "recipes.step",
  description: "While cooking: the current step and the next one ('wat is de volgende stap'), plus what was used so far. Does not move on: recipes_go_to_step does.",
  input: z.object({ meal: mealInput }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the steps", nl: "Stappen bekeken" },
  run: async (ctx, input) => {
    const state = await getCookingState(ctx.householdId, await mealId(ctx, input.meal));
    const at = state.entry.currentStep;
    const total = state.recipe.steps.length;
    return {
      recipe: state.recipe.name,
      servings: state.entry.servings,
      step: total ? `${at + 1} of ${total}` : "no steps",
      current: stepText(state, at),
      next: stepText(state, at + 1) ?? (total ? "That was the last step." : null),
      timerMinutes: state.recipe.steps[at]?.timerMinutes ?? null,
      ingredients: [...state.ingredients, ...state.extras].map((item) => cookingLine(item, ctx.locale)),
    };
  },
});

registerAssistantTool({
  name: "recipes.go_to_step",
  description: "While cooking: go to a step (next, previous, or a number), so the cooking screen and other devices follow.",
  input: z.object({
    move: z.enum(["next", "previous"]).optional(),
    step: z.number().int().min(1).max(MAX_RECIPE_STEPS).optional().describe("Step number, 1 = the first"),
    meal: mealInput,
  }),
  permission: "write",
  confirm: "first-time",
  roles: ["owner", "adult", "child"],
  activity: { en: "Moved to a step", nl: "Naar een stap gegaan" },
  describe: (ctx, input) =>
    input.step
      ? say(ctx.locale, `Go to step ${input.step}`, `Naar stap ${input.step}`)
      : input.move === "previous"
        ? say(ctx.locale, "Go back one step", "Een stap terug")
        : say(ctx.locale, "Go to the next step", "Naar de volgende stap"),
  run: async (ctx, input) => {
    const id = await mealId(ctx, input.meal);
    const before = await getCookingState(ctx.householdId, id);
    const at = before.entry.currentStep;
    const target = input.step ? input.step - 1 : input.move === "previous" ? Math.max(0, at - 1) : at + 1;
    const state = await setStep(ctx.householdId, id, { step: Math.max(0, target) });
    const now = state.entry.currentStep;
    return done(`Step ${now + 1} of ${state.recipe.steps.length}: ${stepText(state, now) ?? "-"}`);
  },
});

registerAssistantTool({
  name: "recipes.done",
  description: "Done cooking: mark the meal made (what was used was already taken out of stock with each use).",
  input: z.object({ meal: mealInput }),
  permission: "write",
  confirm: "first-time",
  roles: ["owner", "adult", "child"],
  activity: { en: "Marked the meal made", nl: "Maaltijd klaar gemeld" },
  describe: (ctx, input) =>
    input.meal ? say(ctx.locale, `${input.meal.name} is made`, `${input.meal.name} is klaar`) : say(ctx.locale, "Mark this meal made", "Deze maaltijd klaar melden"),
  run: async (ctx, input) => {
    const state = await markCooked(ctx.householdId, await mealId(ctx, input.meal));
    const used = usageSummary(state.usages).map((item) => `${amountText(item.quantity, item.unit, ctx.locale)} ${item.name}`);
    return done(`${state.recipe.name} is made.${used.length ? ` Used: ${used.join(", ")}.` : " Nothing was recorded as used."}`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): the recipes page, a recipe and the cooking screen ──────────

registerScreenContext({
  kind: "recipes",
  skills: ["recipes"],
  describe: (ctx) => ({ label: say(ctx.locale, "Recipes", "Recepten"), summary: "the recipes page (the To cook list and all recipes)" }),
});

registerScreenContext({
  kind: "recipe",
  skills: ["recipes"],
  describe: async (ctx, id) => {
    if (!id) return null;
    const recipe = await getRecipe(ctx.householdId, id);
    const names = recipe.ingredients.map((item) => `"${item.name}"`).join(", ");
    return {
      label: recipe.name,
      summary: `recipe "${recipe.name}"${recipe.servings ? ` for ${recipe.servings}` : ""}; ingredients: ${names || "none"}; ${recipe.steps.length} steps`,
    };
  },
});

registerScreenContext({
  kind: "cooking",
  skills: ["recipes"],
  describe: async (ctx, id) => {
    if (!id) return null;
    const state = await getCookingState(ctx.householdId, id);
    const at = state.entry.currentStep;
    const step = stepText(state, at);
    const items = [...state.ingredients, ...state.extras].map(
      (item) => `"${item.name}" ${amountText(item.used, stockUnitOf(item), "en")}${item.needed === null ? "" : ` of ${amountText(item.needed, item.unit, "en")}`}`,
    );
    return {
      label: state.recipe.name,
      summary: `cooking "${state.recipe.name}" for ${state.entry.servings}; step ${at + 1}/${state.recipe.steps.length}${
        step ? `: "${step.length > 160 ? `${step.slice(0, 159)}…` : step}"` : ""
      }; ingredients used/needed: ${items.join(", ") || "none"}`,
    };
  },
});
