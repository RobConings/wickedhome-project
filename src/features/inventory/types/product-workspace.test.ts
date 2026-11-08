import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productAlreadyOnList } from "./product-workspace";

const products = [
  { id: "milk", stockProductId: null },
  { id: "milk-boni", stockProductId: "milk" },
  { id: "milk-other", stockProductId: "milk" },
  { id: "butter", stockProductId: null },
];

describe("productAlreadyOnList", () => {
  it("detects the same product on an open list", () => {
    assert.equal(productAlreadyOnList("milk", products, [{ productId: "milk" }]), true);
  });
  it("recognises alternatives that share stock", () => {
    assert.equal(productAlreadyOnList("milk-boni", products, [{ productId: "milk-other" }]), true);
    assert.equal(productAlreadyOnList("milk", products, [{ productId: "milk-boni" }]), true);
  });
  it("ignores other products and uncatalogued shopping needs", () => {
    assert.equal(productAlreadyOnList("milk", products, [{ productId: "butter" }, { productId: null }]), false);
  });
  it("allows a new need when none exists", () => {
    assert.equal(productAlreadyOnList("milk", products, []), false);
  });
});
