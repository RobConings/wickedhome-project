import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productInputSchema, shoppingStockStatus } from "./shopping";

describe("shopping stock status", () => {
  const stock = (quantity: number, minQuantity: number | null = 2, placeId = "pantry") => ({ quantity, minQuantity, placeId });

  it("distinguishes below, at and above minimum", () => {
    assert.equal(shoppingStockStatus([stock(1)], null), "below_minimum");
    assert.equal(shoppingStockStatus([stock(2)], null), "at_minimum");
    assert.equal(shoppingStockStatus([stock(2.001)], null), "above_minimum");
    assert.equal(shoppingStockStatus([stock(0, 0)], null), "at_minimum");
    assert.equal(shoppingStockStatus([stock(0.249, 0.25)], null), "below_minimum");
  });

  it("does not label stock without a threshold", () => {
    assert.equal(shoppingStockStatus([], null), null);
    assert.equal(shoppingStockStatus([stock(0, null)], null), null);
  });

  it("gives the item's place priority over another place that is lower", () => {
    const items = [stock(0, 2, "fridge"), stock(2, 2, "pantry")];
    assert.equal(shoppingStockStatus(items, "pantry"), "at_minimum");
    assert.equal(shoppingStockStatus(items, "fridge"), "below_minimum");
    assert.equal(shoppingStockStatus(items, "garage"), "below_minimum");
  });

  it("uses the most urgent threshold when the item has no place", () => {
    assert.equal(shoppingStockStatus([stock(2), stock(1)], null), "below_minimum");
    assert.equal(shoppingStockStatus([stock(3), stock(2)], null), "at_minimum");
    assert.equal(shoppingStockStatus([stock(3), stock(4)], null), "above_minimum");
  });

  it("ignores unconfigured minima without treating another place's stock as that place's", () => {
    const items = [stock(0, null, "fridge"), stock(1, 2, "pantry")];
    assert.equal(shoppingStockStatus(items, null), "below_minimum");
    assert.equal(shoppingStockStatus(items, "fridge"), null);
  });
});

describe("essential product input", () => {
  const parse = (isEssential: unknown) => productInputSchema.parse({ name: "Milk", isEssential });

  it("accepts boolean API values and explicit checked or unchecked form values", () => {
    for (const value of [true, "true"]) assert.equal(parse(value).isEssential, true);
    for (const value of [false, "false"]) assert.equal(parse(value).isEssential, false);
  });

  it("keeps an omitted flag optional, so existing API clients preserve the product's setting", () => {
    assert.equal(productInputSchema.parse({ name: "Milk" }).isEssential, undefined);
  });

  it("refuses ambiguous values rather than making them essential", () => {
    for (const isEssential of [1, "yes", "on", null]) {
      assert.equal(productInputSchema.safeParse({ name: "Milk", isEssential }).success, false);
    }
  });
});
