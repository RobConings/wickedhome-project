import assert from "node:assert/strict";
import { it } from "node:test";
import { shoppingProductDetails } from "./shopping-product-details";

const product = { unit: "stuk", defaultShopId: "collect", imageUrl: "https://example.be/broccoli.jpg",
  shopLinks: [{ shopId: "collect", url: "https://collect.be/broccoli", priceCents: 129 }] };
const loose = { unit: "g", shopId: null, url: null, imageUrl: null, priceCents: null };

it("enriches an existing ingredient's shop, link and photo while keeping grams", () => {
  assert.deepEqual(shoppingProductDetails(product, loose), { unit: "g", shopId: "collect", url: product.shopLinks[0]!.url, imageUrl: product.imageUrl, priceCents: 129 });
  assert.equal(loose.shopId, null);
});

it("respects a chosen shop and explicit no-shop instead of attaching another retailer's offer", () => {
  assert.equal(shoppingProductDetails(product, { ...loose, shopId: "okay" }).url, null);
  assert.equal(shoppingProductDetails(product, loose, null).shopId, null);
  assert.equal(shoppingProductDetails(product, loose, null).url, null);
});

it("preserves custom details and chooses a sole known retailer without guessing among several", () => {
  const custom = { ...loose, url: "https://example.be/promo", imageUrl: "https://example.be/own.jpg", priceCents: 99 };
  const result = shoppingProductDetails(product, custom);
  assert.equal(result.url, custom.url);
  assert.equal(result.imageUrl, custom.imageUrl);
  assert.equal(result.priceCents, 99);
  assert.equal(shoppingProductDetails({ ...product, defaultShopId: null }, loose).shopId, "collect");
  assert.equal(shoppingProductDetails({ ...product, defaultShopId: null, shopLinks: [...product.shopLinks, { shopId: "okay", url: null, priceCents: null }] }, loose).shopId, null);
});
