/**
 * Matching recipe ingredients to the household's products: amounts off the name, groups of alternatives as one
 * product, stock and shortfall, unknowns. No database:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/recipes/match.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ingredientName, matchIngredients, parseAmount, pickByName, type MatchProduct } from "./match";

const products: MatchProduct[] = [
  { id: "p-look", name: "Look", unit: "stuk", stockProductId: null },
  { id: "p-spaghetti", name: "Spaghetti", unit: "pak", stockProductId: null, packageAmount: 500, packageUnit: "g" },
  { id: "p-tomaten", name: "Tomaten in blik", unit: "blik", stockProductId: null },
  { id: "p-spek", name: "Spek", unit: "pak", stockProductId: null },
  { id: "p-spek-delhaize", name: "Delhaize gerookte spekblokjes", unit: "pak", stockProductId: "p-spek" },
  { id: "p-olie", name: "Olijfolie", unit: "fles", stockProductId: null },
];

describe("ingredientName", () => {
  it("drops the amount and unit, notes in brackets and after a comma", () => {
    assert.equal(ingredientName("400 g spaghetti"), "spaghetti");
    assert.equal(ingredientName("2 teentjes look, geperst"), "look");
    assert.equal(ingredientName("1 el olijfolie (extra vierge)"), "olijfolie");
    assert.equal(ingredientName("½ bosje peterselie"), "peterselie");
    assert.equal(ingredientName("Gehakt"), "Gehakt");
  });
});

describe("matchIngredients", () => {
  const stock = new Map([
    ["p-look", 3],
    ["p-spaghetti", 0],
    ["p-spek", 2],
  ]);

  it("finds products, uses the group's main product and its shared stock, and flags unknowns", () => {
    const [look, spaghetti, tomaten, spek, basilicum] = matchIngredients(
      [
        { name: "look", amount: "2 teentjes" },
        { name: "spaghetti", amount: "400 g" },
        { name: "tomaten", amount: "1 blik", quantity: 2 },
        { name: "gerookte spekblokjes" },
        { name: "verse basilicum" },
      ],
      products,
      stock,
    );
    // "2 teentjes" doesn't convert to the stock unit: no shortfall claimed.
    assert.deepEqual([look?.product?.name, look?.status, look?.shortfall, look?.comparable], ["Look", "unknown_amount", null, false]);
    assert.equal(look?.amount, "2 teentjes");
    // 400 g against no stock of 500 g packs: buy 1 pack.
    assert.deepEqual([spaghetti?.status, spaghetti?.shortfall], ["short", 1]);
    assert.deepEqual([tomaten?.product?.name, tomaten?.status, tomaten?.shortfall], ["Tomaten in blik", "not_kept", 2]);
    assert.deepEqual([spek?.product?.id, spek?.stock, spek?.status], ["p-spek", 2, "in_stock"], "an alternative's name finds the main product");
    assert.deepEqual([basilicum?.product, basilicum?.status], [null, "unknown"]);
  });
});

describe("parseAmount", () => {
  it("reads the recipe's amount and unit", () => {
    assert.deepEqual(parseAmount("300 g"), { quantity: 300, unit: "g" });
    assert.deepEqual(parseAmount("1,5 l"), { quantity: 1.5, unit: "l" });
    assert.deepEqual(parseAmount("2 teentjes"), { quantity: 2, unit: "teentjes" });
    assert.deepEqual(parseAmount("3"), { quantity: 3, unit: null });
    assert.equal(parseAmount("een handvol"), null);
  });

  it("300 g of a product in 200 g packs with 1 in stock: short, buy 1 pack", () => {
    const [cheese] = matchIngredients(
      [{ name: "emmental", amount: "300 g" }],
      [{ id: "p-kaas", name: "Emmental geraspt", unit: "pak", stockProductId: null, packageAmount: 200, packageUnit: "g" }],
      new Map([["p-kaas", 1]]),
    );
    assert.deepEqual([cheese?.status, cheese?.shortfall], ["short", 1]);
  });
});

describe("pickByName", () => {
  const items = [{ name: "Look" }, { name: "Gehakt" }, { name: "Tomaten in blik" }];

  it("picks the ingredient a spoken name means, or nothing when it isn't clear", () => {
    assert.equal(pickByName(items, "look")?.name, "Look");
    assert.equal(pickByName(items, "1 teentje look")?.name, "Look");
    assert.equal(pickByName(items, "tomaten")?.name, "Tomaten in blik");
    assert.equal(pickByName(items, "basilicum"), null);
  });
});
