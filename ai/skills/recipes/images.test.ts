import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { db } from "@/api/lib/db";
import { installFakeWeb } from "@/api/web/web-fake";
import { getRecipe, listMealPlan, listRecipes, updateRecipe } from "@/api/recipes/recipes.service";
import { getAssistantTool, type AssistantToolContext } from "@ai/core/tools";
import { mcpToolOf } from "@ai/core/mcp.routes";
import "./tools";

const imageUrl = "https://images.example/pasta.jpg";
const row = {
  id: "r1", householdId: "h1", name: "Pasta", servings: 4, sourceUrl: "https://recipes.example/pasta",
  imageUrl, coverFileId: null, notes: null, createdByUserId: "u1", category: null,
  createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-01"),
  ingredients: [], steps: [], _count: { steps: 0 },
};
const ctx: AssistantToolContext = {
  user: { id: "u1", email: "test@example.com", name: "Test", role: "adult", locale: "nl", householdId: "h1", householdName: "Test", habitantId: null },
  householdId: "h1", locale: "nl", channel: "mcp", signal: new AbortController().signal,
};
const run = async (name: string, input: unknown) => {
  const tool = getAssistantTool(`recipes.${name}`);
  assert.ok(tool);
  // Entity names are resolved by the runner after validation; these tests supply that resolved reference.
  const { recipe, ...args } = input as Record<string, unknown>;
  const parsed = tool.input.parse(args) as Record<string, unknown>;
  if (recipe) parsed.recipe = recipe;
  return await tool.run(ctx, parsed) as Record<string, unknown>;
};
// Prisma delegates are proxies: assign their overrides rather than inspecting method descriptors.
const restores: (() => void)[] = [];
function stub<Args extends unknown[], Result>(target: object, key: string, implementation: (...args: Args) => Result) {
  const original = Reflect.get(target, key);
  const replacement = mock.fn(implementation);
  Reflect.set(target, key, replacement);
  restores.push(() => { Reflect.set(target, key, original); });
  return replacement;
}
afterEach(() => { restores.splice(0).reverse().forEach((restore) => restore()); });

describe("recipe photos through the API and MCP tools", () => {
  it("exposes imageUrl in the MCP save schema and reads the original photo from a link", async () => {
    const tool = getAssistantTool("recipes.save");
    assert.ok(tool);
    const schema = mcpToolOf(tool).inputSchema.properties as Record<string, unknown>;
    assert.ok(schema.imageUrl);
    assert.equal(tool.input.safeParse({ name: "Pasta", imageUrl: "javascript:alert(1)" }).success, false);
    const fake = installFakeWeb();
    try {
      const result = await run("read_link", { url: "https://www.kookboek.example/recepten/spaghetti-bolognese" });
      assert.equal(result.imageUrl, "https://www.kookboek.example/img/spaghetti.jpg");
    } finally {
      fake.uninstall();
    }
  });

  it("persists a new photo and returns it in recipe list and detail results", async () => {
    const create = stub(db.recipe, "create", async (args: unknown) => { assert.ok(args); return row; });
    await run("save", { name: "Pasta", imageUrl });
    const args = create.mock.calls[0]?.arguments[0] as { data: { imageUrl: string } };
    assert.equal(args.data.imageUrl, imageUrl);
    stub(db.recipe, "findMany", async () => [row]);
    stub(db.recipe, "findFirst", async () => row);
    stub(db.mealPlanEntry, "findMany", async () => []);
    assert.equal((await listRecipes("h1"))[0]?.imageUrl, imageUrl);
    assert.equal((await getRecipe("h1", row.id)).imageUrl, imageUrl);
    const result = await run("list", {});
    assert.equal((result.items as { imageUrl: string }[])[0]?.imageUrl, imageUrl);
    assert.equal((await run("list", { recipe: { id: row.id, name: row.name } })).imageUrl, imageUrl);
    stub(db.mealPlanEntry, "findMany", async () => [{
      id: "m1", recipeId: row.id, recipe: row, servings: 4, status: "OPEN", currentStep: 0,
      addedByUserId: null, createdAt: row.createdAt, startedAt: null, cookedAt: null,
    }]);
    stub(db.shoppingItem, "groupBy", async () => []);
    assert.equal((await listMealPlan("h1"))[0]?.imageUrl, imageUrl);
  });

  it("preserves a photo when omitted from MCP edits and existing web forms, and supports explicit removal", async () => {
    stub(db.recipe, "findFirst", async () => row);
    const update = mock.fn(async (args: unknown) => { assert.ok(args); return row; });
    const tx = { recipe: { update }, recipeIngredient: { deleteMany: async () => ({ count: 0 }) }, recipeStep: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 0 }) } };
    stub(db, "$transaction", async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
    await run("save", { recipe: { id: row.id, name: row.name }, name: "Pasta updated" });
    assert.equal((update.mock.calls[0]?.arguments[0] as { data: { imageUrl: string } }).data.imageUrl, imageUrl);
    await run("save", { recipe: { id: row.id, name: row.name }, imageUrl: null });
    assert.equal((update.mock.calls[1]?.arguments[0] as { data: { imageUrl: null } }).data.imageUrl, null);
    await updateRecipe("h1", row.id, { name: "Pasta", ingredients: [], steps: [] });
    assert.equal("imageUrl" in (update.mock.calls[2]?.arguments[0] as { data: object }).data, false);
  });
});
