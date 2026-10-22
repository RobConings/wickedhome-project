/** Real services/MCP against a temporary, empty copy of the app schema. Removed afterwards. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pg from "pg";
import type { TokenIdentity } from "../ai/core/assistant.service";

process.loadEnvFile(".env");
const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL missing");
const databaseName = `wh_recipe_import_check_${process.pid}`;
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
  const { createRecipe } = await import("../src/api/recipes/recipes.service");
  const { importRecipes } = await import("../src/api/recipes/recipe-import.service");
  const { saveRecipeCategory } = await import("../src/api/recipes/recipe-categories.service");
  const { recipeInputSchema } = await import("../src/features/recipes/types/recipes");
  const { handleMcpMessage } = await import("../ai/core/mcp.routes");
  const { setAssistantToolAuditor } = await import("../ai/core/tools");
  await import("../ai/skills");
  setAssistantToolAuditor(null);

  const household = await db.household.create({ data: { name: "Import check" } });
  const other = await db.household.create({ data: { name: "Other household" } });
  const actor = { id: "runtime-check", householdId: household.id };
  const pasta = await saveRecipeCategory(household.id, { name: "Pasta" });
  const soup = await saveRecipeCategory(household.id, { name: "Soep" });
  const foreign = await saveRecipeCategory(other.id, { name: "Foreign" });
  const original = await createRecipe(actor, recipeInputSchema.parse({
    name: "Original pasta", sourceUrl: "https://recipes.example/pasta/?utm_source=old#recipe", servings: 4,
    imageUrl: "https://images.example/original.jpg", notes: "Keep these notes",
    ingredients: [{ name: "Pasta", quantity: 200, unit: "g" }], steps: [{ text: "Cook pasta", timerMinutes: 10 }],
  }));
  const snapshot = () => db.recipe.findUniqueOrThrow({ where: { id: original.id }, include: { ingredients: { orderBy: { id: "asc" } }, steps: { orderBy: { id: "asc" } } } });
  const before = await snapshot();
  const identity: TokenIdentity = {
    tokenId: "test", tokenName: "test", scope: "write" as const,
    user: { ...actor, email: "test@example.com", name: "Test", role: "adult" as const, locale: "nl" as const, householdName: household.name, habitantId: null },
  };
  const signal = new AbortController().signal;
  const call = async (args: Record<string, unknown>, as = identity) => await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "recipes_import_batch", arguments: args } }, as, signal) as {
    result?: { isError: boolean; content: { text: string }[]; structuredContent?: { created: number; categorized: number; unchanged: number; items: { id: string; status: string }[] } }; error?: { code: number };
  };
  const payload = { category: "Pasta", recipes: [
    { sourceUrl: "https://recipes.example/pasta", name: "Do not replace", imageUrl: "https://images.example/wrong.jpg", notes: "Wrong notes", ingredients: [], steps: [] },
    { sourceUrl: "https://recipes.example/soup", name: "Tomatensoep", category: "Soep", imageUrl: "https://images.example/soup.jpg", servings: 2,
      ingredients: [{ name: "Tomaten", quantity: 500, unit: "g" }], steps: [{ text: "Kook de soep.", timerMinutes: 15 }] },
    { sourceUrl: "https://recipes.example/soup/?utm_source=chatgpt", name: "Duplicate in batch", category: "Soep" },
  ] };
  const unconfirmed = await call(payload);
  assert.equal(unconfirmed.result?.isError, true);
  assert.equal(await db.recipe.count({ where: { householdId: household.id } }), 1);
  const imported = await call({ ...payload, confirm: true });
  assert.equal(imported.result?.isError, false, imported.result?.content[0]?.text);
  assert.deepEqual([imported.result?.structuredContent?.created, imported.result?.structuredContent?.categorized, imported.result?.structuredContent?.unchanged], [1, 1, 1]);
  assert.deepEqual(await snapshot(), { ...before, categoryId: pasta.id });
  const soupRow = await db.recipe.findFirstOrThrow({ where: { sourceUrl: "https://recipes.example/soup", householdId: household.id }, include: { ingredients: true, steps: true } });
  assert.equal(soupRow.categoryId, soup.id);
  assert.equal(soupRow.imageUrl, "https://images.example/soup.jpg");
  assert.equal(soupRow.servings, 2);
  assert.equal(soupRow.ingredients[0]?.quantity?.toNumber(), 500);
  assert.equal(soupRow.steps[0]?.text, "Kook de soep.");
  assert.equal(soupRow.steps[0]?.timerMinutes, 15);
  const replay = await call({ ...payload, confirm: true });
  assert.equal(replay.result?.structuredContent?.created, 0);
  assert.equal(replay.result?.structuredContent?.unchanged, 3);
  assert.equal(await db.recipe.count({ where: { householdId: household.id } }), 2);
  await importRecipes(actor, { recipes: [{ sourceUrl: "https://recipes.example/pasta" }] });
  assert.deepEqual(await snapshot(), { ...before, categoryId: pasta.id });

  // Concurrent retries cannot both create the same recipe, even with different URL tracking.
  const concurrent = await Promise.all([
    importRecipes(actor, { recipes: [{ sourceUrl: "https://recipes.example/new", name: "Concurrent" }] }),
    importRecipes(actor, { recipes: [{ sourceUrl: "https://recipes.example/new/?fbclid=abc", name: "Concurrent" }] }),
  ]);
  assert.equal(concurrent.reduce((sum, result) => sum + result.created, 0), 1);
  assert.equal(concurrent.reduce((sum, result) => sum + result.unchanged, 0), 1);

  // A later invalid row rolls the entire batch back, including earlier category assignments/new rows.
  const countBefore = await db.recipe.count();
  await assert.rejects(importRecipes(actor, { categoryId: soup.id, recipes: [
    { sourceUrl: "https://recipes.example/pasta" }, { sourceUrl: "https://recipes.example/rollback", name: "Rollback" },
    { sourceUrl: "https://recipes.example/missing-name" },
  ] }), /needs a name/);
  assert.equal(await db.recipe.count(), countBefore);
  assert.deepEqual(await snapshot(), { ...before, categoryId: pasta.id });
  await assert.rejects(importRecipes(actor, { categoryId: foreign.id, recipes: [{ sourceUrl: "https://recipes.example/pasta" }] }), /category/);
  await assert.rejects(importRecipes(actor, { recipes: [{ sourceUrl: "https://recipes.example/product", name: "Invalid product", ingredients: [{ name: "Fake", productId: "foreign", optional: false }] }] }), /product/);
  const otherResult = await importRecipes({ id: "other", householdId: other.id }, { recipes: [{ sourceUrl: "https://recipes.example/pasta", name: "Other household's own recipe" }] });
  assert.equal(otherResult.created, 1, "deduplication is household-scoped");
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(importRecipes(actor, { recipes: [{ sourceUrl: "https://recipes.example/aborted", name: "Cancelled" }] }, aborted.signal));
  assert.equal(await db.recipe.count({ where: { sourceUrl: "https://recipes.example/aborted" } }), 0);
  const child = { ...identity, user: { ...identity.user, role: "child" as const } };
  const denied = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "recipes_import_batch", arguments: { ...payload, confirm: true } } }, child, signal) as { error?: { code: number } };
  assert.equal(denied.error?.code, -32602);
  const readOnly = await call({ ...payload, confirm: true }, { ...identity, scope: "read" });
  assert.equal(readOnly.error?.code, -32602);
  console.log("PASS: batch MCP confirmation/roles, full recipe data, URL deduplication, safe replay, concurrent imports, atomic rollback, category-only preservation, isolation and cancellation.");
} finally {
  await disconnect?.();
  if (created) await control.query(`DROP DATABASE "${databaseName}"`);
  await control.end();
}
