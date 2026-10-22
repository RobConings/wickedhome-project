import type { SessionUser } from "@/features/auth/types/auth";
import { recipeImportInputSchema, type RecipeImportInput, type RecipeImportResult } from "@/features/recipes/types/recipes";
import { db } from "../lib/db";
import { badRequest, conflict } from "../lib/http";

/** Keep meaningful queries and path case; fragments, tracking and a final slash do not identify a recipe. */
export function recipeSourceKey(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  for (const name of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(name) || /^(fbclid|gclid)$/i.test(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  return url.href;
}

/**
 * Atomic, replay-safe import: existing content is never rewritten. A per-household transaction lock
 * serializes import calls, including retries that arrive before the previous HTTP response did.
 */
export async function importRecipes(user: Pick<SessionUser, "id" | "householdId">, input: RecipeImportInput, signal?: AbortSignal): Promise<RecipeImportResult> {
  const parsed = recipeImportInputSchema.parse(input);
  signal?.throwIfAborted();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${user.householdId}, 0))`;
    signal?.throwIfAborted();
    const categoryIds = [...new Set([parsed.categoryId, ...parsed.recipes.map((recipe) => recipe.categoryId)].filter((id): id is string => Boolean(id)))];
    if (categoryIds.length && await tx.recipeCategory.count({ where: { householdId: user.householdId, id: { in: categoryIds } } }) !== categoryIds.length) {
      throw badRequest("A category is not in this household", { categoryId: ["unknownCategory"] });
    }
    const rows = await tx.recipe.findMany({
      where: { householdId: user.householdId, sourceUrl: { not: null } },
      select: { id: true, name: true, sourceUrl: true, categoryId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const existing = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) {
      if (!row.sourceUrl) continue;
      // Legacy source links that aren't valid URLs must not block every import.
      try {
        const key = recipeSourceKey(row.sourceUrl);
        existing.set(key, [...existing.get(key) ?? [], row]);
      } catch { /* Leave this legacy recipe alone. */ }
    }
    const result: RecipeImportResult = { created: 0, categorized: 0, unchanged: 0, items: [] };
    for (const [index, recipe] of parsed.recipes.entries()) {
      signal?.throwIfAborted();
      const key = recipeSourceKey(recipe.sourceUrl);
      const matches = existing.get(key) ?? [];
      const current = matches[0];
      const categoryId = recipe.categoryId ?? parsed.categoryId;
      if (current) {
        const status = categoryId !== undefined && categoryId !== current.categoryId ? "categorized" : "unchanged";
        if (status === "categorized") {
          // Only this column changes: preserve content, child-row ids and even the recipe's timestamps.
          const count = await tx.$executeRaw`
            UPDATE "recipes" SET "categoryId" = ${categoryId}
            WHERE "id" = ${current.id} AND "householdId" = ${user.householdId} AND "sourceUrl" = ${current.sourceUrl}
          `;
          if (!count) throw conflict("A recipe changed during import; retry this batch");
          current.categoryId = categoryId!;
        }
        result[status] += 1;
        result.items.push({ index, id: current.id, name: current.name, status, ...(matches.length > 1 ? { existingDuplicates: matches.length - 1 } : {}) });
        continue;
      }
      if (!recipe.name) throw badRequest(`Recipe ${index + 1} is new and needs a name`, { [`recipes.${index}.name`]: ["requiredForNewRecipe"] });
      const productIds = [...new Set((recipe.ingredients ?? []).flatMap((ingredient) => ingredient.productId ? [ingredient.productId] : []))];
      if (productIds.length && await tx.product.count({ where: { householdId: user.householdId, id: { in: productIds } } }) !== productIds.length) {
        throw badRequest(`Recipe ${index + 1} refers to a product outside this household`, { [`recipes.${index}.ingredients`]: ["unknownProduct"] });
      }
      const saved = await tx.recipe.create({
        data: {
          householdId: user.householdId, createdByUserId: user.id, name: recipe.name,
          sourceUrl: recipe.sourceUrl, categoryId, imageUrl: recipe.imageUrl, servings: recipe.servings, notes: recipe.notes,
          ingredients: { create: (recipe.ingredients ?? []).map((ingredient, position) => ({ ...ingredient, position })) },
          steps: { create: (recipe.steps ?? []).map((step, position) => ({ ...step, position })) },
        },
        select: { id: true, name: true, sourceUrl: true, categoryId: true },
      });
      existing.set(key, [saved]);
      result.created += 1;
      result.items.push({ index, id: saved.id, name: saved.name, status: "created" });
    }
    signal?.throwIfAborted();
    return result;
  }, { timeout: 30_000, maxWait: 10_000 });
}
