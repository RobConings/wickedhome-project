import assert from "node:assert/strict";
import { it } from "node:test";
import type { ResolvedEntity } from "@ai/core/resolve";
import { linkRecipeIngredients } from "./link-ingredients";
import { matchIngredients } from "./match";

const products = [
  { id: "broccoli", name: "Broccoli", unit: "stuk", stockProductId: null },
  { id: "milk", name: "Melk", unit: "pak", stockProductId: null },
  { id: "brand", name: "BONI halfvolle melk", unit: "pak", stockProductId: "milk" },
];

it("automatically links a unique existing product while preserving the recipe's quantities and notes", () => {
  const original = { name: "broccoli", quantity: 250, unit: "g", note: "in roosjes", optional: true };
  const [linked] = linkRecipeIngredients([original], products);
  assert.deepEqual(linked, { ...original, product: { type: "product", id: "broccoli", name: "Broccoli" } });
  assert.equal("product" in original, false);
});

it("checks alternatives and links their shared stock owner", () => {
  const [linked] = linkRecipeIngredients([{ name: "BONI halfvolle melk" }], products);
  assert.equal((linked as typeof linked & { product: ResolvedEntity }).product.id, "milk");
});

it("does not choose arbitrarily between duplicated exact names, including in recipes_match", () => {
  const duplicates = [products[0]!, { ...products[0]!, id: "other-broccoli" }];
  assert.throws(() => linkRecipeIngredients([{ name: "Broccoli" }], duplicates), /Choose an existing product.*broccoli.*other-broccoli/);
  const [match] = matchIngredients([{ name: "Broccoli" }], duplicates, new Map());
  assert.equal(match?.product, null);
  assert.equal(match.maybe.length, 2);
});

it("requires a choice for a plausible brand/variant instead of silently saving loose text", () => {
  assert.throws(() => linkRecipeIngredients([{ name: "halfvolle melk" }], products), /ingredient.product/);
});

it("preserves an explicit product and an existing recipe ingredient's link", () => {
  const selected: ResolvedEntity = { type: "product", id: "broccoli", name: "Broccoli" };
  assert.equal(linkRecipeIngredients([{ name: "groente", product: selected }], products)[0]?.product.id, "broccoli");
  const [kept] = linkRecipeIngredients([{ name: "groente", quantity: 200 }], products, new Map([["groente", selected]]));
  assert.deepEqual(kept, { name: "groente", quantity: 200, product: selected });
});

it("keeps truly unknown ingredients and deliberate exceptions explicit", () => {
  const water = { name: "kraantjeswater", quantity: 200, unit: "ml" };
  assert.deepEqual(linkRecipeIngredients([water], products), [water]);
  const exception = { name: "Melk", unlinkedReason: "Alleen voor de decoratie, niet het voorraadproduct" };
  assert.deepEqual(linkRecipeIngredients([exception], products), [exception]);
});
