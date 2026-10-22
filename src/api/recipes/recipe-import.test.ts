import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipeImportInputSchema } from "@/features/recipes/types/recipes";
import { recipeSourceKey } from "./recipe-import.service";

describe("recipe import links and bounds", () => {
  it("deduplicates URL syntax, fragments, tracking parameters and trailing slashes", () => {
    const expected = "https://recipes.example/Pasta?a=1&b=2";
    assert.equal(recipeSourceKey("https://RECIPES.example:443/Pasta/?b=2&utm_source=chatgpt&a=1&fbclid=123#gerecht"), expected);
    assert.equal(recipeSourceKey("https://recipes.example/Pasta?a=1&b=2&gclid=abc"), expected);
    assert.equal(recipeSourceKey("https://recipes.example/#recipe"), "https://recipes.example/");
  });

  it("preserves meaningful query parameters, path case and protocol", () => {
    assert.notEqual(recipeSourceKey("https://recipes.example/?recipe=1"), recipeSourceKey("https://recipes.example/?recipe=2"));
    assert.notEqual(recipeSourceKey("https://recipes.example/Pasta"), recipeSourceKey("https://recipes.example/pasta"));
    assert.notEqual(recipeSourceKey("https://recipes.example/pasta"), recipeSourceKey("http://recipes.example/pasta"));
  });

  it("allows source-only categorization and at most 25 valid recipes", () => {
    const item = { sourceUrl: "https://recipes.example/pasta" };
    assert.equal(recipeImportInputSchema.safeParse({ recipes: [item] }).success, true);
    assert.equal(recipeImportInputSchema.safeParse({ recipes: Array.from({ length: 25 }, () => item) }).success, true);
    for (const recipes of [[], Array.from({ length: 26 }, () => item), [{ sourceUrl: "javascript:alert(1)" }], [{ ...item, imageUrl: "data:image/png;base64,AAA" }]]) {
      assert.equal(recipeImportInputSchema.safeParse({ recipes }).success, false);
    }
  });
});
