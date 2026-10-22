import type { SessionUser } from "@/features/auth/types/auth";
import {
  servingsScale,
  type CookRecipeInput,
  type CookUsage,
  type CookUseResult,
  type CookingIngredient,
  type CookingState,
  type IngredientCheck,
  type IngredientProduct,
  type MealPlanEntry,
  type MealPlanExtraInput,
  type MealPlanInput,
  type MealPlanStatus,
  type MealPlanStepInput,
  type MealPlanUseInput,
  type PlanResult,
  type Recipe,
  type RecipeCheck,
  type RecipeCoverInput,
  type RecipeIngredient,
  type RecipeInput,
  type RecipeListQuery,
  type RecipeStep,
  type RecipeSummary,
} from "@/features/recipes/types/recipes";
import { compareNeed, toStockUnits, type StockUnitInfo } from "@/types/units";
import { db, type Prisma } from "../lib/db";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import { forgetDocumentLinks } from "../documents/documents.service";
import { revertCookedMovement, stockTotal, useStockForCooking } from "../inventory/inventory.service";
import { forgetEntity } from "../selections/selections.service";
import { addRecipeItem, deleteRecipeItems, groupProductIds, stockOwnerId } from "../shopping/shopping.service";
import { checkRecipeCategory } from "./recipe-categories.service";

/*
 * Recipes and the "To cook" list (docs/RECIPES.md). Household scoped: another household's recipe, meal or
 * product is a 404. Roles are checked by the routes and the assistant tools: everyone reads and cooks
 * (start, use, extras, step, done); owners and adults change recipes and plan meals.
 *
 * Cooking is flexible: nothing is deducted for the whole recipe. Every "Used" tap is a `CookUsage` with the
 * `cooked` stock movement it caused (inventory's `useStockForCooking`, through `applyChange`), so a tap can be
 * undone with a correcting movement. "Done" only marks the meal made.
 *
 * Units: an ingredient's amount is the recipe's own (300 g); stock is counted in the product's stock unit (packs).
 * `compareNeed` / `toStockUnits` (@/types/units) convert through the product's content per package; when the
 * units don't convert, nothing is claimed (status `unknown_amount`) and a tap must say how much in stock units.
 */

type Actor = Pick<SessionUser, "id" | "householdId" | "locale" | "role">;

const round = (value: number) => Math.round(value * 1000) / 1000;
const num = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());
const toStatus = (status: string) => status.toLowerCase() as MealPlanStatus;

// Recipes --------------------------------------------------------------------------------------------------

/** A linked product as recipes show it: page, webshop link, photo, stock unit and content per package (its main product's when it has none). */
const productSelect = {
  id: true,
  name: true,
  imageUrl: true,
  unit: true,
  packageAmount: true,
  packageUnit: true,
  defaultShopId: true,
  shopLinks: { select: { shopId: true, url: true, shop: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
  stockProduct: { select: { unit: true, packageAmount: true, packageUnit: true } },
} satisfies Prisma.ProductSelect;
type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

export function toIngredientProduct(row: ProductRow): IngredientProduct {
  const sized = row.packageAmount ? row : (row.stockProduct ?? row);
  const links = row.shopLinks.filter((link) => link.url);
  const link = links.find((candidate) => candidate.shopId === row.defaultShopId) ?? links[0];
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.imageUrl,
    shopLink: link?.url ? { url: link.url, shopName: link.shop.name } : null,
    unit: row.unit ?? row.stockProduct?.unit ?? null,
    packageAmount: sized.packageAmount?.toNumber() ?? null,
    packageUnit: sized.packageAmount ? sized.packageUnit : null,
  };
}

const recipeInclude = {
  category: { select: { id: true, name: true } },
  ingredients: {
    orderBy: { position: "asc" },
    include: { product: { select: productSelect } },
  },
  steps: { orderBy: { position: "asc" } },
} satisfies Prisma.RecipeInclude;
type RecipeRow = Prisma.RecipeGetPayload<{ include: typeof recipeInclude }>;

const toIngredient = (row: RecipeRow["ingredients"][number]): RecipeIngredient => ({
  id: row.id,
  position: row.position,
  productId: row.productId,
  productName: row.product?.name ?? null,
  product: row.product ? toIngredientProduct(row.product) : null,
  name: row.name,
  quantity: num(row.quantity),
  unit: row.unit,
  note: row.note,
  optional: row.optional,
});

const toStep = (row: RecipeRow["steps"][number]): RecipeStep => ({
  id: row.id,
  position: row.position,
  text: row.text,
  timerMinutes: row.timerMinutes,
});

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    servings: row.servings,
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl,
    coverFileId: row.coverFileId,
    notes: row.notes,
    ingredientCount: row.ingredients.length,
    stepCount: row.steps.length,
    ingredientNames: row.ingredients.map((ingredient) => ingredient.name),
    ingredients: row.ingredients.map(toIngredient),
    steps: row.steps.map(toStep),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Every typed word must appear in the recipe's name or one of its ingredients; case and accents ignored. */
export function recipeMatches(recipe: Pick<RecipeSummary, "name" | "ingredientNames">, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const texts = [recipe.name, ...recipe.ingredientNames].map(fold);
  return words.every((word) => texts.some((text) => text.includes(word)));
}

async function findRecipeRow(householdId: string, id: string) {
  const row = await db.recipe.findFirst({
    where: { id, householdId },
    include: recipeInclude,
  });
  if (!row) throw notFound("Recipe not found");
  return row;
}

/** Every linked product must be the household's. */
async function checkProducts(householdId: string, input: RecipeInput) {
  const ids = [...new Set(input.ingredients.flatMap((ingredient) => (ingredient.productId ? [ingredient.productId] : [])))];
  if (!ids.length) return;
  const found = await db.product.count({
    where: { householdId, id: { in: ids } },
  });
  if (found !== ids.length) throw badRequest("Validation failed", { ingredients: ["unknownProduct"] });
}

const ingredientData = (ingredient: RecipeInput["ingredients"][number], position: number) => ({
  position,
  productId: ingredient.productId || null,
  name: ingredient.name,
  quantity: ingredient.quantity ?? null,
  unit: ingredient.unit || null,
  note: ingredient.note || null,
  optional: ingredient.optional,
});

const stepsCreate = (input: RecipeInput) =>
  input.steps.map((step, position) => ({
    position,
    text: step.text,
    timerMinutes: step.timerMinutes ?? null,
  }));

const recipeFields = (input: RecipeInput) => ({
  name: input.name,
  ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
  servings: input.servings ?? null,
  sourceUrl: input.sourceUrl || null,
  ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
  notes: input.notes || null,
});

/** The household's recipes by name; `q` searches names and ingredients. */
export async function listRecipes(householdId: string, { q, categoryId }: RecipeListQuery = {}): Promise<RecipeSummary[]> {
  const rows = await db.recipe.findMany({
    where: { householdId, ...(categoryId ? { categoryId: categoryId === "none" ? null : categoryId } : {}) },
    include: {
      category: { select: { id: true, name: true } },
      ingredients: { select: { name: true }, orderBy: { position: "asc" } },
      _count: { select: { steps: true } },
    },
    orderBy: { name: "asc" },
  });
  const recipes = rows.map((row): RecipeSummary => ({
    id: row.id,
    name: row.name,
    category: row.category,
    servings: row.servings,
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl,
    coverFileId: row.coverFileId,
    ingredientCount: row.ingredients.length,
    stepCount: row._count.steps,
    ingredientNames: row.ingredients.map((ingredient) => ingredient.name),
    updatedAt: row.updatedAt.toISOString(),
  }));
  return q ? recipes.filter((recipe) => recipeMatches(recipe, q)) : recipes;
}

export async function getRecipe(householdId: string, id: string): Promise<Recipe> {
  return toRecipe(await findRecipeRow(householdId, id));
}

/** Saves a new recipe with its ingredients and steps, in the given order. */
export async function createRecipe(user: Pick<SessionUser, "id" | "householdId">, input: RecipeInput): Promise<Recipe> {
  await checkProducts(user.householdId, input);
  await checkRecipeCategory(user.householdId, input.categoryId);
  const row = await db.recipe.create({
    data: {
      householdId: user.householdId,
      createdByUserId: user.id,
      ...recipeFields(input),
      ingredients: {
        create: input.ingredients.map((ingredient, position) => ingredientData(ingredient, position)),
      },
      steps: { create: stepsCreate(input) },
    },
    include: recipeInclude,
  });
  return toRecipe(row);
}

/**
 * Replaces the recipe's fields, ingredients and steps. Ingredients sent with their `id` are kept (a meal being
 * cooked keeps its taps on them); the others are added, missing ones removed. Steps are replaced.
 */
export async function updateRecipe(householdId: string, id: string, input: RecipeInput): Promise<Recipe> {
  const existing = await findRecipeRow(householdId, id);
  await checkProducts(householdId, input);
  await checkRecipeCategory(householdId, input.categoryId);
  const known = new Set(existing.ingredients.map((ingredient) => ingredient.id));
  const kept = new Set(input.ingredients.flatMap((ingredient) => (ingredient.id && known.has(ingredient.id) ? [ingredient.id] : [])));
  await db.$transaction(async (tx) => {
    await tx.recipe.update({ where: { id }, data: recipeFields(input) });
    await tx.recipeIngredient.deleteMany({
      where: { recipeId: id, id: { notIn: [...kept] } },
    });
    for (const [position, ingredient] of input.ingredients.entries()) {
      if (ingredient.id && kept.has(ingredient.id))
        await tx.recipeIngredient.update({
          where: { id: ingredient.id },
          data: ingredientData(ingredient, position),
        });
      else
        await tx.recipeIngredient.create({
          data: { recipeId: id, ...ingredientData(ingredient, position) },
        });
    }
    await tx.recipeStep.deleteMany({ where: { recipeId: id } });
    await tx.recipeStep.createMany({
      data: stepsCreate(input).map((step) => ({ ...step, recipeId: id })),
    });
  });
  return getRecipe(householdId, id);
}

/** Deletes the recipe and its meals on "To cook"; their shopping items stay. Forgets favourites and attachments. */
export async function deleteRecipe(householdId: string, id: string): Promise<void> {
  await findRecipeRow(householdId, id);
  await db.recipe.delete({ where: { id } });
  await forgetDocumentLinks("recipe", id);
  await forgetEntity("recipe", id);
}

/** Sets an image attached to the recipe as its cover (or removes the cover). */
export async function setRecipeCover(householdId: string, id: string, input: RecipeCoverInput): Promise<Recipe> {
  await findRecipeRow(householdId, id);
  if (input.fileId) {
    const attached = await db.documentLink.count({
      where: {
        householdId,
        entityType: "recipe",
        entityId: id,
        fileId: input.fileId,
        file: { deletedAt: null, mimeType: { startsWith: "image/" } },
      },
    });
    if (!attached) throw badRequest("Validation failed", { fileId: ["notAnAttachedImage"] });
  }
  await db.recipe.update({
    where: { id },
    data: { coverFileId: input.fileId },
  });
  return getRecipe(householdId, id);
}

// Stock check ----------------------------------------------------------------------------------------------

/** Is an open shopping item there for this product (or any product sharing its stock), or this free-text name? */
async function isOnList(householdId: string, productId: string | null, name: string): Promise<boolean> {
  if (productId) {
    const group = await groupProductIds(householdId, await stockOwnerId(householdId, productId));
    return (
      (await db.shoppingItem.count({
        where: { householdId, status: "OPEN", productId: { in: group } },
      })) > 0
    );
  }
  return (
    (await db.shoppingItem.count({
      where: {
        householdId,
        status: "OPEN",
        productId: null,
        name: { equals: name, mode: "insensitive" },
      },
    })) > 0
  );
}

/** Per ingredient: needed for `servings` (default the recipe's), the shared stock, the shortfall and whether it's on a list. */
export async function checkRecipe(householdId: string, id: string, servings?: number | null): Promise<RecipeCheck> {
  const row = await findRecipeRow(householdId, id);
  const forServings = servings ?? row.servings ?? 1;
  const scale = servingsScale(row.servings, forServings);
  const ingredients = await Promise.all(
    row.ingredients.map(async (ingredient): Promise<IngredientCheck> => {
      const [stock, onList] = await Promise.all([
        ingredient.productId ? stockTotal(householdId, ingredient.productId) : Promise.resolve(null),
        isOnList(householdId, ingredient.productId, ingredient.name),
      ]);
      const product = ingredient.product ? toIngredientProduct(ingredient.product) : null;
      const need = compareNeed({ quantity: num(ingredient.quantity), unit: ingredient.unit }, scale, stock, product);
      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        productId: ingredient.productId,
        productName: ingredient.product?.name ?? null,
        product,
        note: ingredient.note,
        optional: ingredient.optional,
        needed: need.needed,
        unit: ingredient.unit,
        stock,
        comparable: need.comparable,
        neededInStockUnits: need.neededInStockUnits,
        stockInRecipeUnit: need.stockInRecipeUnit,
        shortfall: need.shortfall,
        shortfallPackages: need.shortfallPackages,
        status: need.status,
        onList,
      };
    }),
  );
  return { recipeId: row.id, servings: forServings, ingredients };
}

// The "To cook" list -----------------------------------------------------------------------------------------

const entryInclude = {
  recipe: {
    select: {
      id: true,
      name: true,
      coverFileId: true,
      imageUrl: true,
      _count: { select: { steps: true } },
    },
  },
} satisfies Prisma.MealPlanEntryInclude;
type EntryRow = Prisma.MealPlanEntryGetPayload<{
  include: typeof entryInclude;
}>;

async function toEntries(householdId: string, rows: EntryRow[]): Promise<MealPlanEntry[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const userIds = [...new Set(rows.flatMap((row) => (row.addedByUserId ? [row.addedByUserId] : [])))];
  const [counts, users] = await Promise.all([
    db.shoppingItem.groupBy({
      by: ["mealPlanEntryId"],
      where: { householdId, status: "OPEN", mealPlanEntryId: { in: ids } },
      _count: { _all: true },
    }),
    userIds.length
      ? db.user.findMany({
          where: { householdId, id: { in: userIds } },
          select: {
            id: true,
            email: true,
            habitant: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const open = new Map(counts.map((count) => [count.mealPlanEntryId, count._count._all]));
  const names = new Map(users.map((user) => [user.id, user.habitant?.name ?? user.email]));
  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipeId,
    recipeName: row.recipe.name,
    coverFileId: row.recipe.coverFileId,
    imageUrl: row.recipe.imageUrl,
    servings: row.servings,
    status: toStatus(row.status),
    currentStep: row.currentStep,
    stepCount: row.recipe._count.steps,
    addedByName: row.addedByUserId ? (names.get(row.addedByUserId) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    cookedAt: row.cookedAt?.toISOString() ?? null,
    openItemCount: open.get(row.id) ?? 0,
  }));
}

async function findEntryRow(householdId: string, id: string) {
  const row = await db.mealPlanEntry.findFirst({
    where: { id, householdId },
    include: entryInclude,
  });
  if (!row) throw notFound("Meal not found");
  return row;
}

async function getEntry(householdId: string, id: string): Promise<MealPlanEntry> {
  const [entry] = await toEntries(householdId, [await findEntryRow(householdId, id)]);
  return entry!;
}

const COOKED_DAYS = 14;

/** "To cook": meals being cooked first, then waiting ones (oldest first); `cooked` adds the meals made in the last 14 days. */
export async function listMealPlan(householdId: string, { cooked = false }: { cooked?: boolean } = {}): Promise<MealPlanEntry[]> {
  const since = new Date(Date.now() - COOKED_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.mealPlanEntry.findMany({
    where: {
      householdId,
      OR: [{ status: { in: ["OPEN", "COOKING"] } }, ...(cooked ? [{ status: "COOKED" as const, cookedAt: { gte: since } }] : [])],
    },
    include: entryInclude,
    orderBy: { createdAt: "asc" },
  });
  const order = { COOKING: 0, OPEN: 1, COOKED: 2 } as const;
  rows.sort((a, b) => order[a.status] - order[b.status] || (a.status === "COOKED" ? (b.cookedAt?.getTime() ?? 0) - (a.cookedAt?.getTime() ?? 0) : 0));
  return toEntries(householdId, rows);
}

/** The meals being cooked right now (for the assistant: "the only busy session"). */
export async function listCookingEntries(householdId: string): Promise<MealPlanEntry[]> {
  const rows = await db.mealPlanEntry.findMany({
    where: { householdId, status: "COOKING" },
    include: entryInclude,
    orderBy: { startedAt: "desc" },
  });
  return toEntries(householdId, rows);
}

/**
 * Puts a recipe on "To cook" for `servings` and the chosen ingredients on the shopping list (`addRecipeItem`:
 * an open item for the same product group gets more quantity instead of a second line; ingredients without a
 * product become free-text items). A product's item is in its stock unit, whole packages (default: the check's
 * packages to buy, or 1 when the units don't convert); a free-text item has the recipe's amount and unit.
 */
export async function planRecipe(user: Actor, input: MealPlanInput): Promise<PlanResult> {
  const { householdId } = user;
  const check = await checkRecipe(householdId, input.recipeId, input.servings);
  const byId = new Map(check.ingredients.map((ingredient) => [ingredient.ingredientId, ingredient]));
  for (const item of input.items) if (!byId.has(item.ingredientId)) throw badRequest("Validation failed", { items: ["unknownIngredient"] });

  const row = await db.mealPlanEntry.create({
    data: {
      householdId,
      recipeId: input.recipeId,
      servings: input.servings,
      addedByUserId: user.id,
    },
  });
  let added = 0;
  let merged = 0;
  for (const item of input.items) {
    const ingredient = byId.get(item.ingredientId)!;
    const quantity = ingredient.product
      ? (item.quantity ?? (ingredient.shortfallPackages || ingredient.neededInStockUnits ? Math.ceil(ingredient.shortfallPackages || ingredient.neededInStockUnits || 1) : 1))
      : (item.quantity ?? ingredient.needed);
    const result = await addRecipeItem(user, {
      productId: ingredient.productId,
      name: ingredient.productName ?? ingredient.name,
      quantity,
      unit: ingredient.product ? ingredient.product.unit : ingredient.unit,
      mealPlanEntryId: row.id,
      note: ingredient.productId ? null : ingredient.note,
    });
    if (result.merged) merged += 1;
    else added += 1;
  }
  return { entry: await getEntry(householdId, row.id), added, merged };
}

/** Removes a meal from "To cook"; with `removeItems` also its open shopping items. What was used stays used. */
export async function deleteMealPlanEntry(
  householdId: string,
  id: string,
  { removeItems = false }: { removeItems?: boolean } = {},
): Promise<{ removedItems: number }> {
  await findEntryRow(householdId, id);
  const removedItems = removeItems ? await deleteRecipeItems(householdId, id) : 0;
  await db.mealPlanEntry.delete({ where: { id } });
  return { removedItems };
}

// Cooking --------------------------------------------------------------------------------------------------

/** Everything the cooking view needs: steps, ingredients with needed / used / stock, extras and the taps. */
export async function getCookingState(householdId: string, id: string): Promise<CookingState> {
  const entryRow = await findEntryRow(householdId, id);
  const [recipe, extras, usages, [entry]] = await Promise.all([
    findRecipeRow(householdId, entryRow.recipeId),
    db.cookExtraIngredient.findMany({
      where: { entryId: id },
      include: { product: { select: productSelect } },
      orderBy: { createdAt: "asc" },
    }),
    db.cookUsage.findMany({
      where: { entryId: id },
      orderBy: { createdAt: "desc" },
    }),
    toEntries(householdId, [entryRow]),
  ]);
  const scale = servingsScale(recipe.servings, entryRow.servings);
  const productIds = [...new Set([...recipe.ingredients, ...extras].flatMap((item) => (item.productId ? [item.productId] : [])))];
  const stocks = new Map(await Promise.all(productIds.map(async (productId) => [productId, await stockTotal(householdId, productId)] as const)));

  const live = usages.filter((usage) => !usage.undoneAt);
  const usedOf = (match: (usage: (typeof usages)[number]) => boolean) =>
    round(live.filter(match).reduce((sum, usage) => sum + usage.quantity.toNumber(), 0));
  const lastOf = (match: (usage: (typeof usages)[number]) => boolean) => live.find(match)?.id ?? null;

  /** A cooking line: the need in the recipe's unit and stock units, what a tap takes, used so far in both units. */
  const line = (
    base: Pick<CookingIngredient, "kind" | "id" | "name" | "productId" | "note" | "optional">,
    amount: { quantity: number | null; unit: string | null },
    product: IngredientProduct | null,
    scaleBy: number,
    mine: (usage: (typeof usages)[number]) => boolean,
  ): CookingIngredient => {
    const stock = product ? (stocks.get(product.id) ?? null) : null;
    const need = amount.quantity === null ? null : compareNeed(amount, scaleBy, stock, product);
    const per = product ? toStockUnits(1, amount.unit, product) : null;
    const comparable = !product || amount.quantity === null || per !== null;
    const used = usedOf(mine);
    return {
      ...base,
      product,
      needed: need?.needed ?? null,
      unit: amount.unit,
      comparable,
      neededInStockUnits: need?.neededInStockUnits ?? null,
      // Without an amount, one tap is 1 (a piece, a pack); in a unit that doesn't convert, the tap asks.
      tapAmount: !product ? (need?.needed ?? 1) : amount.quantity === null ? 1 : (need?.neededInStockUnits ?? null),
      used,
      usedInRecipeUnit: product && per && amount.unit ? round(used / per) : null,
      stock,
      lastUsageId: lastOf(mine),
    };
  };

  const ingredients = recipe.ingredients.map((ingredient) =>
    line(
      { kind: "ingredient", id: ingredient.id, name: ingredient.name, productId: ingredient.productId, note: ingredient.note, optional: ingredient.optional },
      { quantity: num(ingredient.quantity), unit: ingredient.unit },
      ingredient.product ? toIngredientProduct(ingredient.product) : null,
      scale,
      (usage) => usage.ingredientId === ingredient.id,
    ),
  );
  // Extras saved to the recipe show as recipe ingredients (their taps go there). An extra's amount is as used, not scaled.
  const extraItems = extras
    .filter((extra) => !extra.savedToRecipe)
    .map((extra) =>
      line(
        { kind: "extra", id: extra.id, name: extra.name, productId: extra.productId, note: null, optional: false },
        { quantity: num(extra.quantity), unit: extra.unit },
        extra.product ? toIngredientProduct(extra.product) : null,
        1,
        (usage) => usage.extraId === extra.id,
      ),
    );

  // Per ingredient or extra: its name, the unit its taps are counted in, and the recipe unit to show them in too.
  const lines = new Map<string, { name: string; unit: string | null; recipeUnit: string | null; product: StockUnitInfo | null }>([
    ...recipe.ingredients.map((ingredient) => [ingredient.id, refOf(ingredient.name, ingredient.unit, ingredient.product)] as const),
    ...extras.map((extra) => [extra.id, refOf(extra.name, extra.unit, extra.product)] as const),
  ]);
  const deducted = await movementDeltas(
    householdId,
    usages.flatMap((usage) => (usage.movementId ? [usage.movementId] : [])),
  );
  return {
    entry: entry!,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      coverFileId: recipe.coverFileId,
      steps: recipe.steps.map(toStep),
    },
    ingredients,
    extras: extraItems,
    usages: usages.map((usage): CookUsage => {
      const refId = usage.extraId ?? usage.ingredientId;
      const ref = refId ? lines.get(refId) : undefined;
      const quantity = usage.quantity.toNumber();
      const per = ref?.product && ref.recipeUnit ? toStockUnits(1, ref.recipeUnit, ref.product) : null;
      return {
        id: usage.id,
        kind: usage.extraId ? "extra" : "ingredient",
        refId,
        name: ref?.name ?? "?",
        quantity,
        unit: ref?.unit ?? null,
        recipeQuantity: per && ref?.recipeUnit ? { amount: round(quantity / per), unit: ref.recipeUnit } : null,
        deducted: usage.movementId ? (deducted.get(usage.movementId) ?? 0) : 0,
        undone: Boolean(usage.undoneAt),
        createdAt: usage.createdAt.toISOString(),
      };
    }),
  };
}

/**
 * A tap's reference: with a product, taps are counted in its stock unit and also shown in the recipe's unit
 * when that is another unit that converts (300 g = 1.5 packs); without a product, in the ingredient's own unit.
 */
function refOf(name: string, unit: string | null, product: ProductRow | null) {
  if (!product) return { name, unit, recipeUnit: null, product: null };
  const info = toIngredientProduct(product);
  const differs = Boolean(unit) && toStockUnits(1, unit, info) !== 1;
  return { name, unit: info.unit, recipeUnit: differs ? unit : null, product: info };
}

/** How much each `cooked` movement took out of stock (positive). */
async function movementDeltas(householdId: string, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db.stockMovement.findMany({
    where: { householdId, id: { in: ids } },
    select: { id: true, delta: true },
  });
  return new Map(rows.map((row) => [row.id, round(-row.delta.toNumber())]));
}

/** A meal that may still be cooked (not made yet); a waiting one starts cooking with the first action. */
async function findCookableEntry(householdId: string, id: string) {
  const row = await findEntryRow(householdId, id);
  if (row.status === "COOKED") throw conflict("This meal was already made");
  if (row.status === "OPEN")
    await db.mealPlanEntry.update({
      where: { id },
      data: { status: "COOKING", startedAt: new Date() },
    });
  return row;
}

/** Starts cooking a meal on "To cook" (a made one can be cooked again). */
export async function startCooking(user: Actor, id: string): Promise<CookingState> {
  const row = await findEntryRow(user.householdId, id);
  if (row.status !== "COOKING")
    await db.mealPlanEntry.update({
      where: { id },
      data: { status: "COOKING", startedAt: new Date(), cookedAt: null },
    });
  return getCookingState(user.householdId, id);
}

/**
 * Starts cooking a recipe straight from its page: continues the meal being cooked, else takes the oldest
 * waiting one on "To cook", else creates one on the fly (for `servings`, default the recipe's).
 */
export async function cookRecipe(user: Actor, recipeId: string, input: CookRecipeInput = {}): Promise<CookingState> {
  const recipe = await findRecipeRow(user.householdId, recipeId);
  const existing =
    (await db.mealPlanEntry.findFirst({
      where: { householdId: user.householdId, recipeId, status: "COOKING" },
      orderBy: { startedAt: "desc" },
    })) ??
    (await db.mealPlanEntry.findFirst({
      where: { householdId: user.householdId, recipeId, status: "OPEN" },
      orderBy: { createdAt: "asc" },
    }));
  const id =
    existing?.id ??
    (
      await db.mealPlanEntry.create({
        data: {
          householdId: user.householdId,
          recipeId,
          servings: input.servings ?? recipe.servings ?? 1,
          addedByUserId: user.id,
        },
      })
    ).id;
  if (existing && input.servings && existing.status === "OPEN")
    await db.mealPlanEntry.update({
      where: { id },
      data: { servings: input.servings },
    });
  return startCooking(user, id);
}

/**
 * "I used this": takes `quantity` out of stock (the shared stock of the product's group) as a `cooked` movement
 * linked to the meal, and records the tap. Can be called again ("1 more garlic"). A `productId` that isn't
 * in the recipe (no ingredient of the same product group) becomes an extra of this meal. An ingredient without
 * a product, or a product not kept in stock, is recorded without touching stock.
 */
export async function useIngredient(user: Actor, id: string, input: MealPlanUseInput): Promise<CookUseResult> {
  const { householdId } = user;
  const entry = await findCookableEntry(householdId, id);
  let ingredientId: string | null = null;
  let extraId: string | null = null;
  let productId: string | null = null;

  if (input.ingredientId) {
    const ingredient = await db.recipeIngredient.findFirst({
      where: { id: input.ingredientId, recipeId: entry.recipeId },
    });
    if (!ingredient) throw notFound("Ingredient not found");
    ingredientId = ingredient.id;
    productId = ingredient.productId;
  } else if (input.extraId) {
    const extra = await db.cookExtraIngredient.findFirst({
      where: { id: input.extraId, entryId: id },
    });
    if (!extra) throw notFound("Ingredient not found");
    extraId = extra.id;
    productId = extra.productId;
  } else if (input.productId) {
    productId = input.productId;
  }

  // In stock units: `unit` ("g") is converted through the product's content per package, never guessed.
  const quantity = productId ? await stockQuantity(householdId, productId, input.quantity, input.unit) : input.quantity;
  if (input.productId) ({ ingredientId, extraId } = await resolveProduct(user, id, entry.recipeId, input.productId, quantity));

  const change = productId
    ? await useStockForCooking(user, productId, quantity, id, entry.recipe.name)
    : { movementId: null, addedToShoppingList: false };
  const usage = await db.cookUsage.create({
    data: {
      entryId: id,
      ingredientId,
      extraId,
      quantity,
      movementId: change.movementId,
      userId: user.id,
    },
  });
  return {
    state: await getCookingState(householdId, id),
    usageId: usage.id,
    addedToShoppingList: change.addedToShoppingList,
  };
}

/** `quantity` of `unit` in the product's stock units (no unit: already stock units); refused when it doesn't convert. */
async function stockQuantity(householdId: string, productId: string, quantity: number, unit: string | null | undefined): Promise<number> {
  if (!unit) return quantity;
  const row = await db.product.findFirst({ where: { id: productId, householdId }, select: productSelect });
  if (!row) throw notFound("Product not found");
  const product = toIngredientProduct(row);
  const converted = toStockUnits(quantity, unit, product);
  if (converted === null || converted <= 0) {
    throw badRequest(`${quantity} ${unit} can't be converted to ${row.name}'s stock unit (${product.unit ?? "pieces"}): give the amount in that unit, or set the content per package.`, {
      quantity: ["unitDoesNotConvert"],
    });
  }
  return converted;
}

/** A product used while cooking: the recipe's ingredient of the same product group, an extra already added, or a new extra. */
async function resolveProduct(user: Actor, entryId: string, recipeId: string, productId: string, quantity: number) {
  const owner = await stockOwnerId(user.householdId, productId);
  const group = await groupProductIds(user.householdId, owner);
  const ingredient = await db.recipeIngredient.findFirst({
    where: { recipeId, productId: { in: group } },
    orderBy: { position: "asc" },
  });
  if (ingredient) return { ingredientId: ingredient.id, extraId: null };
  const extra = await db.cookExtraIngredient.findFirst({
    where: { entryId, productId: { in: group }, savedToRecipe: false },
  });
  if (extra) return { ingredientId: null, extraId: extra.id };
  const product = await db.product.findFirstOrThrow({
    where: { id: productId },
    select: { name: true, unit: true },
  });
  const created = await db.cookExtraIngredient.create({
    data: {
      entryId,
      productId,
      name: product.name,
      quantity,
      unit: product.unit,
    },
  });
  return { ingredientId: null, extraId: created.id };
}

/** Undoes one tap: puts back what it took from stock (a correcting `cooked` movement). Undoing twice does nothing. */
export async function undoUsage(user: Actor, id: string, usageId: string): Promise<CookingState> {
  const entry = await findEntryRow(user.householdId, id);
  const usage = await db.cookUsage.findFirst({
    where: { id: usageId, entryId: id },
  });
  if (!usage) throw notFound("Usage not found");
  if (!usage.undoneAt) {
    const { count } = await db.cookUsage.updateMany({
      where: { id: usageId, undoneAt: null },
      data: { undoneAt: new Date() },
    });
    if (count && usage.movementId) {
      await revertCookedMovement(user, usage.movementId, user.locale === "nl" ? `Ongedaan: ${entry.recipe.name}` : `Undone: ${entry.recipe.name}`);
    }
  }
  return getCookingState(user.householdId, id);
}

/**
 * Adds an ingredient while cooking (a product, or free text). `saveToRecipe` (owners and adults) also adds it to
 * the recipe for next time: it then shows as a recipe ingredient. `use` records it as used right away.
 */
export async function addExtra(user: Actor, id: string, input: MealPlanExtraInput): Promise<CookingState> {
  const { householdId } = user;
  const entry = await findCookableEntry(householdId, id);
  if (input.saveToRecipe && user.role === "child") throw forbidden("Children can't change recipes");
  const product = input.productId
    ? await db.product.findFirst({
        where: { id: input.productId, householdId },
        select: { id: true, name: true, unit: true },
      })
    : null;
  if (input.productId && !product) throw badRequest("Validation failed", { productId: ["unknownProduct"] });
  const name = input.name?.trim() || product?.name || "";
  const unit = input.unit || product?.unit || null;
  // Used right away in a unit that doesn't convert to the stock: refused before anything is saved.
  if (input.use && product && input.quantity && unit) await stockQuantity(householdId, product.id, input.quantity, unit);

  const extra = await db.cookExtraIngredient.create({
    data: {
      entryId: id,
      productId: product?.id ?? null,
      name,
      quantity: input.quantity ?? null,
      unit,
      savedToRecipe: input.saveToRecipe,
    },
  });
  let ingredientId: string | null = null;
  if (input.saveToRecipe) {
    const last = await db.recipeIngredient.findFirst({
      where: { recipeId: entry.recipeId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    // Stored in the recipe's own servings: the amount used now is scaled back.
    const scale = servingsScale(
      (
        await db.recipe.findUniqueOrThrow({
          where: { id: entry.recipeId },
          select: { servings: true },
        })
      ).servings,
      entry.servings,
    );
    const ingredient = await db.recipeIngredient.create({
      data: {
        recipeId: entry.recipeId,
        position: (last?.position ?? -1) + 1,
        productId: product?.id ?? null,
        name,
        quantity: input.quantity ? round(input.quantity / scale) : null,
        unit,
      },
    });
    ingredientId = ingredient.id;
  }
  if (input.use) {
    await useIngredient(user, id, {
      ...(ingredientId ? { ingredientId } : { extraId: extra.id }),
      quantity: input.quantity ?? 1,
      unit: input.quantity ? unit : null,
    });
  }
  return getCookingState(householdId, id);
}

/** Remembers the step the cook is at, so another device or the assistant knows where she is. */
export async function setStep(householdId: string, id: string, input: MealPlanStepInput): Promise<CookingState> {
  const entry = await findEntryRow(householdId, id);
  const step = Math.min(input.step, Math.max(0, entry.recipe._count.steps - 1));
  await db.mealPlanEntry.update({ where: { id }, data: { currentStep: step } });
  return getCookingState(householdId, id);
}

/** "Done cooking": marks the meal made. Nothing more is deducted (every tap already was). */
export async function markCooked(householdId: string, id: string): Promise<CookingState> {
  const entry = await findEntryRow(householdId, id);
  if (entry.status !== "COOKED") {
    await db.mealPlanEntry.update({
      where: { id },
      data: {
        status: "COOKED",
        cookedAt: new Date(),
        startedAt: entry.startedAt ?? new Date(),
      },
    });
  }
  return getCookingState(householdId, id);
}
