import assert from "node:assert/strict";
import { it } from "node:test";
import { compareNeed } from "@/types/units";
import type { IngredientCheck } from "./recipes";
import { defaultRecipePurchase, parseRecipePurchaseQuantity, recipePurchaseQuantity } from "./recipe-shopping";

function ingredient(unit: string, stock: number, recipeUnit: string): IngredientCheck {
  const product = { id: "vegetable", name: "Vegetable", unit, packageAmount: null, packageUnit: null, imageUrl: null, shopLink: null };
  return { ...compareNeed({ quantity: 4, unit: recipeUnit }, 1, stock, product), ingredientId: "ingredient", name: "Vegetable", productId: product.id, productName: product.name, product, note: null, optional: false, onList: false, stock, unit: recipeUnit };
}
it("selects empty chicory but requires a chosen purchase weight, and does not auto-select a bag of onions", () => {
  const chicory = ingredient("kg", 0, "stronkje");
  assert.equal(defaultRecipePurchase(chicory), true);
  assert.equal(recipePurchaseQuantity(chicory), null);
  assert.equal(defaultRecipePurchase({ ...chicory, onList: true }), false);
  assert.equal(defaultRecipePurchase({ ...chicory, optional: true }), false);
  assert.equal(defaultRecipePurchase(ingredient("zak", 1, "stuk")), false);
  assert.equal(parseRecipePurchaseQuantity("1,2"), 1.2);
  for (const input of ["", "0", "-1", "unknown", "100001"]) assert.equal(parseRecipePurchaseQuantity(input), null);
});
it("preserves fractional purchases measured in kilograms", () => {
  const chicory = ingredient("kg", 0, "kg");
  chicory.shortfallPackages = 0.3;
  assert.equal(recipePurchaseQuantity(chicory), 0.3);
});
