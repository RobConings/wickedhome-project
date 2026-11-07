import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTotal, type ShoppingItem } from "./shopping";
import { combineShoppingItems, shoppingItemListIds, shoppingItemQuantity } from "./shopping-product-rows";

function item(id: string, changes: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id, productId: "leek", name: "Prei", quantity: 1, unit: "stuks", listId: "groceries", listName: "Boodschappen",
    source: "manual", shopId: null, shop: null, url: null, imageUrl: null, priceCents: null, note: null,
    placeId: null, placeName: null, category: "produce", isEssential: true, stockStatus: "below_minimum",
    taskId: null, project: null, expenseId: null, status: "open", boughtAt: null, boughtByName: null,
    alternatives: [], recipe: null, createdAt: "2026-10-31T10:00:00.000Z", ...changes,
  };
}

describe("one shopping position per product", () => {
  it("keeps the recipe's grams while buying whole known packages at the product's price", () => {
    const original = item("recipe", { source: "recipe", quantity: 250, unit: "g", priceCents: 129 });
    const [position] = combineShoppingItems([original], new Map([["leek", { unit: "stuk", packageAmount: 500, packageUnit: "g" }]]));
    assert.ok(position);
    assert.equal(position.quantity, 1);
    assert.equal(position.unit, "stuk");
    assert.equal(position.requirements?.[0]?.quantity, 250);
    assert.equal(position.requirements?.[0]?.unit, "g");
    assert.equal(estimateTotal([position]).cents, 129);
    assert.equal(original.quantity, 250);
  });

  it("does not guess a package conversion when the catalogue only knows a piece", () => {
    const [position] = combineShoppingItems([item("recipe", { quantity: 250, unit: "g", priceCents: 129 })],
      new Map([["leek", { unit: "stuk", packageAmount: 1, packageUnit: "pcs" }]]));
    assert.ok(position?.amounts);
    assert.equal(position.quantity, 250);
    assert.equal(position.unit, "g");
    assert.equal(estimateTotal([position]).priced, 0);
  });

  it("does not count the same record or an overlapping combined requirement twice", () => {
    const a = item("a", { quantity: 2 });
    const b = item("b", { quantity: 3 });
    assert.equal(combineShoppingItems([a, a])[0]?.quantity, 2);
    const [combined] = combineShoppingItems([a, b]);
    assert.ok(combined);
    assert.equal(combineShoppingItems([combined, b])[0]?.quantity, 5);
  });

  it("combines existing groceries and low stock without double counting the minimum", () => {
    const rows = [item("low", { source: "low_stock", listId: "low", listName: "Bijna op" }), item("recipe", { source: "recipe", quantity: 3 })];
    for (const input of [rows, [...rows].reverse()]) {
      const [position] = combineShoppingItems(input);
      assert.equal(position?.id, "recipe");
      assert.equal(position.quantity, 3);
      assert.equal(position.stockStatus, "below_minimum");
      assert.deepEqual(shoppingItemListIds(position).sort(), ["groceries", "low"]);
      assert.equal(position.requirements?.length, 2);
    }
  });

  it("uses a larger replenishment target when deliberate purchases don't cover it", () => {
    const [position] = combineShoppingItems([item("low", { source: "low_stock", quantity: 5 }), item("recipe", { source: "recipe", quantity: 3 })]);
    assert.equal(position?.quantity, 5);
  });

  it("adds independent meal needs while treating staples and low stock as targets", () => {
    const meal = (id: string, quantity: number) => item(id, { source: "recipe", quantity, recipe: { entryId: id, recipeId: id, name: id } });
    const [position] = combineShoppingItems([meal("meal-a", 3), meal("meal-b", 2), item("staple", { source: "staple", quantity: 4 }), item("low", { source: "low_stock" })]);
    assert.equal(position?.quantity, 5);
    assert.deepEqual(position.requirements?.flatMap((part) => part.recipe?.entryId ?? []), ["meal-a", "meal-b"]);
  });

  it("deduplicates the same minimum target but includes different stock locations", () => {
    const low = (id: string, placeId: string) => item(id, { source: "low_stock", placeId, quantity: 2 });
    const [position] = combineShoppingItems([low("a", "kitchen"), low("b", "kitchen"), low("c", "garage")]);
    assert.equal(position?.quantity, 4);
  });

  it("converts compatible units before adding and preserves every note and task reference", () => {
    const [position] = combineShoppingItems([item("a", { quantity: 1, unit: "kg", note: "For soup", taskId: "task-a" }), item("b", { quantity: 500, unit: "g", note: "For lunch", taskId: "task-b" })]);
    assert.equal(position?.quantity, 1.5);
    assert.equal(position.unit, "kg");
    assert.deepEqual(position.requirements?.map((part) => part.taskId), ["task-a", "task-b"]);
    assert.equal(position.note, "For soup\nFor lunch");
  });

  it("uses known package content to combine mass with counted packages", () => {
    const [position] = combineShoppingItems([item("a", { quantity: 2, unit: "pack" }), item("b", { quantity: 500, unit: "g" })],
      new Map([["leek", { unit: "pack", packageAmount: 250, packageUnit: "g" }]]));
    assert.equal(position?.quantity, 4);
    assert.equal(position.amounts, undefined);
  });

  it("keeps incompatible amounts explicit on one row without guessing a conversion or a price", () => {
    const [position] = combineShoppingItems([item("a", { quantity: 3, priceCents: 199 }), item("b", { quantity: 500, unit: "g" })]);
    assert.ok(position);
    assert.equal(shoppingItemQuantity(position, "nl"), "3 stuks + 500 g");
    assert.deepEqual(estimateTotal([position]), { cents: 0, priced: 0, unpriced: 1 });
  });

  it("never merges distinct products or unrelated free-text items just because their names match", () => {
    assert.equal(combineShoppingItems([item("a"), item("b", { productId: "other-leek" }), item("c", { productId: null }), item("d", { productId: null })]).length, 4);
  });

  it("keeps past purchases separate from open needs and from other purchases", () => {
    const bought = (id: string, boughtAt: string) => item(id, { status: "bought", boughtAt });
    const positions = combineShoppingItems([item("open"), bought("past-a", "2026-10-30T10:00:00Z"), bought("past-b", "2026-10-31T10:00:00Z"), bought("past-c", "2026-10-31T10:00:00Z")]);
    assert.equal(positions.length, 3);
    assert.equal(positions[2]?.quantity, 2);
  });

  it("uses one chosen shop and never combines that shop's URL with another shop's price", () => {
    const [position] = combineShoppingItems([
      item("a", { shopId: "okay", url: "https://okay.be/prei" }),
      item("b", { source: "low_stock", shopId: "collect", priceCents: 199, imageUrl: "https://example.be/prei.jpg" }),
    ]);
    assert.equal(position?.shopId, "okay");
    assert.equal(position.url, "https://okay.be/prei");
    assert.equal(position.priceCents, null);
    assert.equal(position.imageUrl, "https://example.be/prei.jpg");
  });
});
