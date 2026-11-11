import assert from "node:assert/strict";
import { it } from "node:test";
import type { StockItem } from "./inventory";
import { excludedFromStocktake, stocktakeItems } from "./stocktake";

const products = [
  { id: "potatoes", name: "Aardappelen", stockProductId: null },
  { id: "boni", name: "BONI Nicola", stockProductId: "potatoes" },
  { id: "other-brand", name: "Andere aardappelen", stockProductId: "potatoes" },
];
const stock = (productId: string, placeId = "kitchen", extra: Partial<StockItem> = {}): StockItem => ({
  id: `${productId}-${placeId}`, productId, productName: productId, placeId, placeName: placeId,
  quantity: 2, unit: "zak", minQuantity: null, expiresOn: null, isLow: false, updatedAt: "2026-11-11T12:00:00.000Z", ...extra,
});

it("counts a linked stock pool only once per location, preferring the owner's row regardless of order", () => {
  const items = [stock("boni", "kitchen", { quantity: 99 }), stock("potatoes"), stock("other-brand"), stock("potatoes", "pantry")];
  for (const input of [items, [...items].reverse()]) {
    const result = stocktakeItems(input, products);
    assert.equal(result.length, 2);
    const kitchen = result.find((item) => item.placeId === "kitchen")!;
    assert.equal(kitchen.id, "potatoes-kitchen");
    assert.equal(kitchen.productId, "potatoes");
    assert.equal(kitchen.productName, "Aardappelen");
    assert.equal(kitchen.quantity, 2, "shared stock projections are never added together");
    assert.deepEqual(kitchen.alternativeNames, ["BONI Nicola", "Andere aardappelen"]);
  }
});

it("does not merge unlinked products just because their names describe potatoes", () => {
  const result = stocktakeItems([stock("potatoes"), stock("unlinked-potatoes")], products);
  assert.equal(result.length, 2);
});

it("does not count duplicate projections of the same stock record", () => {
  const item = stock("potatoes");
  assert.equal(stocktakeItems([item, item], products).length, 1);
});

it("excludes positive and fractional stock until depleted, independently for each location", () => {
  const kitchen = stock("potatoes", "kitchen", { countExcludedUntilEmpty: true, quantity: 0.5 });
  assert.equal(excludedFromStocktake(kitchen), true);
  assert.equal(excludedFromStocktake({ ...kitchen, quantity: 0 }), false);
  assert.equal(excludedFromStocktake(stock("potatoes", "pantry")), false);
});
