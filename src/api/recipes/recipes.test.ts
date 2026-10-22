/**
 * Recipes: the pure helpers (scaling and rounding needs, splitting pasted instructions, timers, ingredients of a
 * step), the contract, search matching, and the API's role checks and validation over HTTP (an in-process
 * Express app with a fake signed-in user; every request here is refused before the service, so no database is
 * needed). Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/recipes/recipes.test.ts
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import {
  canCook,
  canManageRecipes,
  mealPlanExtraFormSchema,
  mealPlanUseInputSchema,
  recipeFormSchema,
  recipeInputSchema,
  recipeCategoryInputSchema,
  filterRecipesByCategory,
  servingsScale,
  sortForStep,
  splitInstructions,
  timerFromText,
} from "@/features/recipes/types/recipes";
import { compareNeed } from "@/types/units";
import { errorHandler } from "../lib/http";
import { recipesRouter } from "./recipes.routes";
import { recipeMatches } from "./recipes.service";

describe("needs for servings (compareNeed, @/types/units)", () => {
  it("scales the recipe's amount by servings before comparing with stock in packs", () => {
    assert.equal(servingsScale(4, 6), 1.5);
    assert.equal(servingsScale(null, 6), 1, "a recipe without servings is used as it is");
    const cheese = compareNeed({ quantity: 200, unit: "g" }, servingsScale(4, 6), 1, { unit: "pak", packageAmount: 200, packageUnit: "g" });
    assert.deepEqual([cheese.needed, cheese.shortfall, cheese.shortfallPackages, cheese.status], [300, 100, 1, "short"]);
  });
});

describe("instructions and steps", () => {
  it("splits numbered lines and drops the numbers", () => {
    const steps = splitInstructions("1. Snipper de ui.\n2) Bak de ui 5 min\nin olijfolie.\nStap 3: Voeg de tomaten toe.");
    assert.deepEqual(
      steps.map((step) => step.text),
      ["Snipper de ui.", "Bak de ui 5 min in olijfolie.", "Voeg de tomaten toe."],
    );
    assert.equal(steps[1]?.timerMinutes, 5);
  });

  it("splits paragraphs, or lines when there are no blank lines", () => {
    assert.equal(splitInstructions("Kook de pasta.\n\nMaak de saus.\nRoer goed.").length, 2);
    assert.equal(splitInstructions("Kook de pasta.\nMaak de saus.").length, 2);
    assert.deepEqual(splitInstructions("  "), []);
  });

  it("reads timers in minutes and hours", () => {
    assert.equal(timerFromText("Laat 25 minuten sudderen"), 25);
    assert.equal(timerFromText("Bake for 1,5 hours"), 90);
    assert.equal(timerFromText("Voeg 2 uien toe"), null);
  });

  it("puts the ingredients a step mentions first", () => {
    const items = [{ name: "Spaghetti" }, { name: "Uien" }, { name: "Gehakt" }];
    assert.deepEqual(
      sortForStep(items, "Bak het gehakt met de ui").map((item) => item.name),
      ["Uien", "Gehakt", "Spaghetti"],
    );
    assert.deepEqual(sortForStep(items, null), items);
  });
});

describe("recipe contract", () => {
  it("validates categories and distinguishes leaving a category alone from removing it", () => {
    assert.equal(recipeCategoryInputSchema.parse({ name: "  Warme   gerechten  " }).name, "Warme gerechten");
    assert.equal(recipeCategoryInputSchema.safeParse({ name: "  " }).success, false);
    assert.equal(recipeCategoryInputSchema.safeParse({ name: "x".repeat(81) }).success, false);
    assert.equal(recipeInputSchema.parse({ name: "Pasta" }).categoryId, undefined);
    assert.equal(recipeInputSchema.parse({ name: "Pasta", categoryId: "c1" }).categoryId, "c1");
    for (const categoryId of ["", "none", null]) assert.equal(recipeFormSchema.parse({ name: "Pasta", categoryId }).categoryId, null);
  });

  it("filters by category or uncategorized without dropping matching recipes", () => {
    const recipes = [{ id: "r1", category: { id: "c1", name: "Pasta" } }, { id: "r2", category: null }, { id: "r3", category: { id: "c2", name: "Soep" } }];
    assert.deepEqual(filterRecipesByCategory(recipes).map((recipe) => recipe.id), ["r1", "r2", "r3"]);
    assert.deepEqual(filterRecipesByCategory(recipes, "c1").map((recipe) => recipe.id), ["r1"]);
    assert.deepEqual(filterRecipesByCategory(recipes, "none").map((recipe) => recipe.id), ["r2"]);
    assert.deepEqual(filterRecipesByCategory(recipes, "missing"), []);
  });

  it("accepts original web photos, distinguishes omission from removal and refuses unsafe image URLs", () => {
    const url = "https://images.example/pasta.jpg";
    assert.equal(recipeInputSchema.parse({ name: "Pasta", imageUrl: url }).imageUrl, url);
    assert.equal(recipeInputSchema.parse({ name: "Pasta" }).imageUrl, undefined);
    assert.equal(recipeInputSchema.parse({ name: "Pasta", imageUrl: null }).imageUrl, null);
    for (const imageUrl of ["javascript:alert(1)", "data:image/png;base64,AAA", "/pasta.jpg", `https://images.example/${"a".repeat(2000)}`]) {
      assert.equal(recipeInputSchema.safeParse({ name: "Pasta", imageUrl }).success, false);
    }
  });

  it("reads the posted form: ingredients as JSON, steps as text, a website without https://", () => {
    const parsed = recipeFormSchema.parse({
      name: " Spaghetti ",
      servings: "4",
      sourceUrl: "recepten.example.be/spaghetti",
      ingredients: JSON.stringify([
        {
          name: "Spaghetti",
          productId: "p1",
          quantity: 1,
          unit: "pack",
          optional: false,
        },
        { name: "Basilicum", optional: true },
      ]),
      steps: "1. Kook de pasta 10 min.\n2. Maak de saus.",
    });
    assert.equal(parsed.name, "Spaghetti");
    assert.equal(parsed.servings, 4);
    assert.equal(parsed.sourceUrl, "https://recepten.example.be/spaghetti");
    assert.equal(parsed.ingredients.length, 2);
    assert.equal(parsed.ingredients[1]?.optional, true);
    assert.deepEqual(parsed.steps, [
      { text: "Kook de pasta 10 min.", timerMinutes: 10 },
      { text: "Maak de saus.", timerMinutes: null },
    ]);
  });

  it("refuses an empty name, bad links and a use without exactly one target", () => {
    assert.equal(recipeFormSchema.safeParse({ name: " " }).success, false);
    assert.equal(
      recipeFormSchema.safeParse({
        name: "X",
        sourceUrl: "javascript:alert(1)",
      }).success,
      false,
    );
    assert.equal(mealPlanUseInputSchema.safeParse({ quantity: 1 }).success, false);
    assert.equal(
      mealPlanUseInputSchema.safeParse({
        ingredientId: "i1",
        productId: "p1",
        quantity: 1,
      }).success,
      false,
    );
    assert.equal(mealPlanUseInputSchema.safeParse({ ingredientId: "i1", quantity: 0 }).success, false);
    assert.equal(
      mealPlanUseInputSchema.safeParse({
        productId: "p1",
        quantity: "1,5".replace(",", "."),
      }).success,
      true,
    );
  });

  it("reads the extra-ingredient form: a product or a name, switches on only when posted", () => {
    assert.equal(mealPlanExtraFormSchema.safeParse({}).success, false);
    const parsed = mealPlanExtraFormSchema.parse({ name: "Look", use: "on" });
    assert.equal(parsed.use, true);
    assert.equal(parsed.saveToRecipe, false);
  });

  it("lets everyone cook and only owners and adults manage", () => {
    assert.equal(canManageRecipes("adult"), true);
    assert.equal(canManageRecipes("child"), false);
    assert.equal(canCook("child"), true);
  });

  it("finds a recipe by its name or an ingredient, every word, accents ignored", () => {
    const recipe = {
      name: "Spaghetti bolognese",
      ingredientNames: ["Gehakt", "Crème fraîche"],
    };
    assert.equal(recipeMatches(recipe, "bolo"), true);
    assert.equal(recipeMatches(recipe, "creme gehakt"), true);
    assert.equal(recipeMatches(recipe, "curry"), false);
  });
});

describe("recipes API", () => {
  let base = "";
  let role: Role | null = "child";
  const server = (() => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (role) {
        req.user = {
          id: "u1",
          email: "u@example.com",
          name: "Test",
          role,
          locale: "nl",
          householdId: "h1",
          householdName: "Test",
          habitantId: null,
        } satisfies SessionUser;
      }
      next();
    });
    app.use("/recipes", recipesRouter);
    app.use(errorHandler);
    return app.listen(0);
  })();

  before(() => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/recipes`;
  });
  after(() => {
    server.close();
  });

  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("needs a signed-in user", async () => {
    role = null;
    assert.equal((await call("GET", "/")).status, 401);
    assert.equal(
      (
        await call("POST", "/meal-plan/e1/use", {
          ingredientId: "i1",
          quantity: 1,
        })
      ).status,
      401,
    );
  });

  it("refuses children changes to recipes and planning", async () => {
    role = "child";
    const valid = { name: "Spaghetti" };
    assert.equal((await call("POST", "/", valid)).status, 403);
    assert.equal((await call("PUT", "/r1", valid)).status, 403);
    assert.equal((await call("DELETE", "/r1")).status, 403);
    assert.equal((await call("PUT", "/r1/cover", { fileId: null })).status, 403);
    assert.equal((await call("POST", "/categories", { name: "Pasta" })).status, 403);
    assert.equal((await call("PUT", "/categories/c1", { name: "Pasta" })).status, 403);
    assert.equal((await call("DELETE", "/categories/c1")).status, 403);
    assert.equal((await call("POST", "/meal-plan", { recipeId: "r1", servings: 2 })).status, 403);
    assert.equal((await call("DELETE", "/meal-plan/e1")).status, 403);
  });

  it("lets children cook: their cooking calls reach validation instead of a 403", async () => {
    role = "child";
    assert.equal((await call("POST", "/meal-plan/e1/use", { quantity: 1 })).status, 400);
    assert.equal((await call("POST", "/meal-plan/e1/extras", { quantity: 1 })).status, 400);
    assert.equal((await call("PUT", "/meal-plan/e1/step", { step: -1 })).status, 400);
    assert.equal((await call("POST", "/r1/cook", { servings: 0 })).status, 400);
  });

  it("validates input for adults before touching anything", async () => {
    role = "adult";
    assert.equal((await call("POST", "/categories", { name: " " })).status, 400);
    const response = await call("POST", "/", {
      name: "",
      ingredients: [{ name: "" }],
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      error: { code: string; fields?: Record<string, string[]> };
    };
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.fields?.name, "name error");
    assert.ok(body.error.fields?.["ingredients.0.name"], "ingredient error");
    assert.equal((await call("POST", "/meal-plan", { recipeId: "r1", servings: 0 })).status, 400);
    assert.equal((await call("GET", "/r1/check?servings=500")).status, 400);
    assert.equal((await call("GET", "/?q=" + "x".repeat(101))).status, 400);
  });
});
