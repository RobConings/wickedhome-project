/**
 * Recipe categories over the real database services and MCP, in a temporary database with the app's schema.
 * The database is removed afterwards; the application's data is never modified.
 *   npx tsx scripts/recipe-categories-runtime-check.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pg from "pg";

process.loadEnvFile(".env");
const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL missing");
const databaseName = `wh_recipe_categories_check_${process.pid}`;
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${databaseName}`;
const control = new pg.Client({ connectionString: sourceUrl });
await control.connect();
let created = false;
let disconnect: (() => Promise<void>) | undefined;

try {
  await control.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  execFileSync("bash", ["-o", "pipefail", "-c", 'pg_dump --schema-only --no-owner --no-acl "$RECIPE_SRC" | psql -q -v ON_ERROR_STOP=1 "$RECIPE_DST" > /dev/null'], {
    env: { ...process.env, RECIPE_SRC: sourceUrl, RECIPE_DST: targetUrl.toString() },
  });
  process.env.DATABASE_URL = targetUrl.toString();
  const { db } = await import("../src/api/lib/db");
  disconnect = () => db.$disconnect();
  const categories = await import("../src/api/recipes/recipe-categories.service");
  const recipes = await import("../src/api/recipes/recipes.service");
  const { recipeInputSchema } = await import("../src/features/recipes/types/recipes");
  const { handleMcpMessage } = await import("../ai/core/mcp.routes");
  const { setAssistantToolAuditor } = await import("../ai/core/tools");
  await import("../ai/skills");
  setAssistantToolAuditor(null);

  const household = await db.household.create({ data: { name: "Recipe category check" } });
  const other = await db.household.create({ data: { name: "Other household" } });
  const pasta = await categories.saveRecipeCategory(household.id, { name: "Pasta" });
  const foreign = await categories.saveRecipeCategory(other.id, { name: "Pasta" });
  await assert.rejects(categories.saveRecipeCategory(household.id, { name: " PÁSTA " }), /Validation failed/);
  assert.deepEqual((await categories.listRecipeCategories(household.id)).map((category) => category.id), [pasta.id]);

  const input = recipeInputSchema.parse({
    name: "Test spaghetti", servings: 4, categoryId: pasta.id,
    sourceUrl: "https://recipes.example/spaghetti", imageUrl: "https://images.example/spaghetti.jpg", notes: "Keep these notes",
    ingredients: [{ name: "Spaghetti", quantity: 200, unit: "g" }], steps: [{ text: "Kook de pasta 10 minuten.", timerMinutes: 10 }],
  });
  const actor = { id: "runtime-check", householdId: household.id };
  const saved = await recipes.createRecipe(actor, input);
  await recipes.createRecipe(actor, recipeInputSchema.parse({ name: "Zonder categorie" }));
  assert.equal(saved.category?.id, pasta.id);
  assert.equal((await recipes.listRecipes(household.id, { categoryId: pasta.id }))[0]?.id, saved.id);
  assert.equal((await recipes.listRecipes(household.id, { categoryId: "none" })).length, 1);
  assert.equal((await recipes.listRecipes(household.id, { categoryId: foreign.id })).length, 0);
  assert.equal((await categories.listRecipeCategories(household.id))[0]?.recipeCount, 1);
  await assert.rejects(recipes.createRecipe(actor, { ...input, categoryId: foreign.id }), /Validation failed/);
  await assert.rejects(recipes.updateRecipe(household.id, saved.id, { ...input, categoryId: foreign.id }), /Validation failed/);
  await assert.rejects(categories.saveRecipeCategory(other.id, { name: "Stolen" }, pasta.id), /not found/);
  await assert.rejects(categories.deleteRecipeCategory(other.id, pasta.id), /not found/);

  const identity = {
    tokenId: "runtime", tokenName: "runtime", scope: "write" as const,
    user: { id: actor.id, householdId: household.id, email: "test@example.com", name: "Test", role: "adult" as const, locale: "nl" as const, householdName: household.name, habitantId: null },
  };
  const signal = new AbortController().signal;
  const call = async (name: string, args: Record<string, unknown>, userIdentity = identity) => {
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, userIdentity, signal) as {
      result?: { isError: boolean; content: { text: string }[] }; error?: unknown;
    };
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, false, response.result?.content[0]?.text);
    return JSON.parse(response.result?.content[0]?.text ?? "null");
  };
  const listed = await call("recipes_list", { category: "Pasta" });
  assert.equal(listed.count, 1);
  assert.equal(listed.items[0].category, "Pasta");
  const createdCategory = await call("recipes_save_category", { name: "Soep", confirm: true });
  assert.equal(createdCategory.name, "Soep");
  await call("recipes_save", { recipe: saved.name, category: "Soep", confirm: true });
  assert.equal((await recipes.getRecipe(household.id, saved.id)).category?.name, "Soep");
  await call("recipes_save", { recipe: saved.name, notes: "Updated notes", confirm: true });
  assert.equal((await recipes.getRecipe(household.id, saved.id)).category?.name, "Soep", "an unrelated MCP edit preserves the category");
  await call("recipes_save", { recipe: saved.name, noCategory: true, confirm: true });
  assert.equal((await recipes.getRecipe(household.id, saved.id)).category, null);
  await call("recipes_save", { recipe: saved.name, category: "Soep", confirm: true });
  const child = { ...identity, user: { ...identity.user, role: "child" as const } };
  const childWrite = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "recipes_save_category", arguments: { name: "Forbidden", confirm: true } } }, child, signal) as { error?: { code: number } };
  assert.equal(childWrite.error?.code, -32602);

  // Deleting a category changes only the category reference, including on recipes with ingredients/steps.
  const before = await db.recipe.findUniqueOrThrow({ where: { id: saved.id }, include: { ingredients: true, steps: true } });
  await call("recipes_delete_category", { category: "Soep", confirm: true });
  const after = await db.recipe.findUniqueOrThrow({ where: { id: saved.id }, include: { ingredients: true, steps: true } });
  assert.equal(after.categoryId, null);
  assert.deepEqual({ ...after, categoryId: null }, { ...before, categoryId: null });
  await categories.saveRecipeCategory(household.id, { name: "Pasta en rijst" }, pasta.id);
  assert.equal((await categories.listRecipeCategories(household.id))[0]?.name, "Pasta en rijst");
  console.log("PASS: category CRUD, duplicate names, recipe assignment, filtering, household isolation, MCP, child permissions and recipe preservation on deletion.");
} finally {
  await disconnect?.();
  if (created) await control.query(`DROP DATABASE "${databaseName}"`);
  await control.end();
}
