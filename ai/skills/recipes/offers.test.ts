/**
 * Webshop offers (recipes_find_product → inventory_save_product / recipes_save): kept per household, expire, and
 * fill a product's photo, shop and package size without overwriting what it has. No database:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/recipes/offers.test.ts
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { ProductInput } from "@/features/shopping/types/shopping";
import { withOffer } from "./offer-products";
import { clearOffers, getOffer, rememberOffer, type Offer } from "./offers";

const offer: Offer = {
  shopId: "s-collect",
  shopName: "Collect&Go",
  name: "Boni bloem 1 kg",
  url: "https://www.collectandgo.be/nl/product/bloem",
  priceCents: 129,
  imageUrl: "https://images.example.be/bloem.jpg",
  packageAmount: 1,
  packageUnit: "kg",
};

const input = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  name: "Bloem",
  unit: "st.",
  category: "pantry",
  defaultShopId: null,
  barcode: null,
  qrCode: null,
  imageUrl: null,
  notes: null,
  packageAmount: null,
  packageUnit: null,
  ...overrides,
});

describe("offers", () => {
  beforeEach(() => clearOffers());

  it("remembers an offer per household and forgets it after two hours", () => {
    const now = Date.UTC(2026, 9, 9, 12);
    const id = rememberOffer("h1", offer, now);
    assert.match(id, /^of-[0-9a-f]{6}$/);
    assert.deepEqual(getOffer("h1", id, now + 60_000), offer);
    assert.equal(getOffer("h2", id, now), null, "another household's offer is unknown");
    assert.equal(getOffer("h1", id, now + 2 * 60 * 60 * 1000 + 1), null, "expired");
  });

  it("fills the photo, default shop and package size only where the product has none", () => {
    assert.deepEqual(
      { ...withOffer(input(), offer) },
      { ...input(), imageUrl: offer.imageUrl, defaultShopId: "s-collect", packageAmount: 1, packageUnit: "kg" },
    );
    const own = withOffer(input({ imageUrl: "https://own.example.be/x.jpg", defaultShopId: "s-delhaize", packageAmount: 500, packageUnit: "g" }), offer);
    assert.deepEqual([own.imageUrl, own.defaultShopId, own.packageAmount, own.packageUnit], ["https://own.example.be/x.jpg", "s-delhaize", 500, "g"]);
  });

  it("skips a photo the product contract wouldn't accept", () => {
    assert.equal(withOffer(input(), { ...offer, imageUrl: "data:image/png;base64,AAA" }).imageUrl, null);
  });
});
