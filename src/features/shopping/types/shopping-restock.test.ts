import assert from "node:assert/strict";
import { it } from "node:test";
import { nextShoppingRestockState } from "./shopping-restock";

it("requires an increase followed by a later decrease; reads and clamped changes cannot reset dismissal", () => {
  assert.equal(nextShoppingRestockState("DISMISSED", 0), "DISMISSED");
  assert.equal(nextShoppingRestockState("DISMISSED", -1), "DISMISSED");
  assert.equal(nextShoppingRestockState("DISMISSED", 1), "RESTOCKED");
  assert.equal(nextShoppingRestockState("RESTOCKED", 0), "RESTOCKED");
  assert.equal(nextShoppingRestockState("RESTOCKED", 1), "RESTOCKED");
  assert.equal(nextShoppingRestockState("RESTOCKED", -1), "ACTIVE");
  assert.equal(nextShoppingRestockState("ACTIVE", -1), "ACTIVE");
});
