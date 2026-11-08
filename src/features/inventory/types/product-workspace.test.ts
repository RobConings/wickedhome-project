import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productAlreadyOnList, sharedStockDestination } from "./product-workspace";

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
  it("still recognises the selected product when a catalogue refresh omits it", () => {
    assert.equal(productAlreadyOnList("milk", [], [{ productId: "milk" }]), true);
    assert.equal(productAlreadyOnList("milk-boni", products.slice(1), [{ productId: "milk" }]), true);
  });
});

it("shared-stock navigation preserves the originating record, section and filters independently of the variant", () => {
  const destination = sharedStockDestination("https://home.test/inventory/products/milk-boni?workspace=overview&from=%2Fshopping%3FshopId%3Dlocal&filter=low#product-needs", "milk", "milk-boni");
  const url = new URL(destination, "https://home.test");
  assert.equal(url.pathname, "/inventory/products/milk");
  assert.equal(url.searchParams.get("workspace"), "overview");
  assert.equal(url.searchParams.get("from"), "/shopping?shopId=local");
  assert.equal(url.searchParams.get("variant"), "milk-boni");
  assert.equal(url.searchParams.get("filter"), "low");
  assert.equal(url.hash, "#product-needs");
});
