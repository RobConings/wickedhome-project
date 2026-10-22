/**
 * Recipe steps when the JSON-LD cuts them off (a recipe site whose structured data has only 2 teaser steps
 * pointing at its "cooking mode", while the page itself shows all 13): the HTML instruction list, Next.js
 * flight data, or the text under "Bereiding". Trimmed fixtures of that page structure; no network.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/web/recipe-steps.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPage, headingTextSteps, stepsFromJsonText, stepsLookCut } from "./web-extract";

const base = new URL("https://kookblog.example/gerechten/ovenschotel-met-puree-prei-kaassaus");

const STEPS = Array.from({ length: 13 }, (_, index) => `Stap ${index + 1} van de ovenschotel: snij, kook en meng alles zorgvuldig.`.replace("Stap", `Doe dit voor stap`));

const jsonLd = (steps: number, ingredients = 9) =>
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Ovenschotel met puree, prei en kaassaus",
    recipeYield: "4 personen",
    recipeIngredient: Array.from({ length: ingredients }, (_, index) => `ingrediënt ${index + 1}`),
    recipeInstructions: STEPS.slice(0, steps).map((text) => ({ "@type": "HowToStep", text, url: `${base.href}/kookmodus` })),
  })}</script>`;

const htmlList = STEPS.map((text, index) => `<div data-testid="recipe-instruction"><span>${index + 1}</span><p>${text}</p></div>`).join("");

const flight = `<script>self.__next_f.push([1,${JSON.stringify(
  `5:["$","div",null,{"instructions":[${STEPS.map((text, index) => JSON.stringify({ step: index + 1, description: text })).join(",")}]}]`,
)}])</script>`;

const page = (head: string, body: string) => `<!doctype html><html><head><title>Ovenschotel</title>${head}</head><body><main><h1>Ovenschotel</h1>${body}</main></body></html>`;

describe("recipe steps from the page", () => {
  it("takes the 13 steps of the HTML instruction list over 2 cut-off JSON-LD steps", () => {
    const recipe = extractPage(page(jsonLd(2), `<section>${htmlList}</section>`), base).recipe;
    assert.equal(recipe?.steps.length, 13);
    assert.equal(recipe?.stepsSource, "page");
    assert.equal(recipe?.stepsIncomplete, false);
    assert.equal(recipe?.steps[0], STEPS[0], "the leading number is dropped");
    assert.equal(recipe?.ingredients.length, 9);
  });

  it("reads Next.js flight data when there is no list", () => {
    const recipe = extractPage(page(jsonLd(2), `<p>Bekijk de kookmodus.</p>${flight}`), base).recipe;
    assert.deepEqual(recipe?.steps, STEPS);
    assert.equal(recipe?.stepsSource, "page");
  });

  it("falls back to the text under 'Bereiding' when the structured steps look cut off", () => {
    const body = `<h2>Bereiding</h2>${STEPS.slice(0, 6).map((text, index) => `<p>${index + 1}. ${text}</p>`).join("")}<h2>Tips</h2><p>Lekker met een frisse salade erbij geserveerd.</p>`;
    const recipe = extractPage(page(jsonLd(2), body), base).recipe;
    assert.equal(recipe?.steps.length, 6);
    assert.equal(recipe?.stepsSource, "page");
  });

  it("keeps complete structured steps, and flags cut-off ones the page can't complete", () => {
    const complete = extractPage(page(jsonLd(5, 6), "<p>Smakelijk!</p>"), base).recipe;
    assert.deepEqual([complete?.steps.length, complete?.stepsSource, complete?.stepsIncomplete], [5, "structured", false]);
    const cut = extractPage(page(jsonLd(2), "<p>Bekijk de kookmodus voor alle stappen.</p>"), base).recipe;
    assert.deepEqual([cut?.steps.length, cut?.stepsSource, cut?.stepsIncomplete], [2, "structured", true]);
  });

  it("dedupes repeated steps and keeps their order", () => {
    const twice = `<div class="steps-mobile">${htmlList}</div>`;
    const recipe = extractPage(page(jsonLd(2), `${twice}<div class="steps-desktop">${htmlList}</div>`), base).recipe;
    assert.deepEqual(recipe?.steps, STEPS);
  });
});

describe("step helpers", () => {
  it("sees few steps for many ingredients as cut off", () => {
    assert.equal(stepsLookCut(2, 9), true);
    assert.equal(stepsLookCut(2, 5), false);
    assert.equal(stepsLookCut(6, 12), false);
  });

  it("reads step objects in either key order, by step number", () => {
    const text = `[{"description":"Tweede stap van het recept hier","step":2},{"step":1,"description":"Eerste stap van het recept \\"nu\\""}]`;
    assert.deepEqual(stepsFromJsonText(text), ['Eerste stap van het recept "nu"', "Tweede stap van het recept hier"]);
  });

  it("stops the heading text at the next section", () => {
    assert.deepEqual(headingTextSteps("Ingrediënten\n2 prei\nBereiding\n1\nSnij de prei in fijne ringen.\nKook de aardappelen gaar.\nTips\nNiet te lang koken, zegt oma altijd."), [
      "Snij de prei in fijne ringen.",
      "Kook de aardappelen gaar.",
    ]);
  });
});
