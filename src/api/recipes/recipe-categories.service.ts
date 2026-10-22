import type { RecipeCategory, RecipeCategoryInput } from "@/features/recipes/types/recipes";
import { db } from "../lib/db";
import { badRequest, notFound } from "../lib/http";

export const recipeCategoryNameKey = (name: string) => name.trim().replace(/\s+/g, " ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const categoryInclude = { _count: { select: { recipes: true } } } as const;
const toCategory = (row: { id: string; name: string; _count: { recipes: number } }): RecipeCategory => ({
  id: row.id, name: row.name, recipeCount: row._count.recipes,
});

export async function listRecipeCategories(householdId: string): Promise<RecipeCategory[]> {
  return (await db.recipeCategory.findMany({ where: { householdId }, include: categoryInclude, orderBy: { name: "asc" } })).map(toCategory);
}

/** A recipe may only use one of its own household's categories. Omission preserves its category. */
export async function checkRecipeCategory(householdId: string, categoryId: string | null | undefined): Promise<void> {
  if (!categoryId) return;
  const category = await db.recipeCategory.findFirst({ where: { id: categoryId, householdId }, select: { id: true } });
  if (!category) throw badRequest("Validation failed", { categoryId: ["unknownCategory"] });
}

export async function saveRecipeCategory(householdId: string, input: RecipeCategoryInput, id?: string): Promise<RecipeCategory> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const fields = { name, nameKey: recipeCategoryNameKey(name) };
  try {
    const row = id
      ? await db.recipeCategory.update({ where: { id, householdId }, data: fields, include: categoryInclude })
      : await db.recipeCategory.create({ data: { householdId, ...fields }, include: categoryInclude });
    return toCategory(row);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002") throw badRequest("Validation failed", { name: ["duplicateCategory"] });
      if (error.code === "P2025") throw notFound("Recipe category not found");
    }
    throw error;
  }
}

/** The foreign key clears categoryId only; recipes, ingredients, steps and timestamps are preserved. */
export async function deleteRecipeCategory(householdId: string, id: string): Promise<void> {
  const { count } = await db.recipeCategory.deleteMany({ where: { id, householdId } });
  if (!count) throw notFound("Recipe category not found");
}
