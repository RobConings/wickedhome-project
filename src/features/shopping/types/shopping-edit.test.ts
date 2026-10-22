/**
 * Editing an item and the shop view's estimate (pure):
 *
 *   npx tsx --test src/features/shopping/types/shopping-edit.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editToUpdate, estimateTotal, shoppingItemEditSchema } from "./shopping";

describe("the item edit form", () => {
  it("an emptied field clears it, a category of 'none' is no category", () => {
    const parsed = shoppingItemEditSchema.parse({ name: "DYRGRIP Rodewijnglas", quantity: "6", category: "none" });
    assert.deepEqual(editToUpdate(parsed), {
      name: "DYRGRIP Rodewijnglas",
      productId: null,
      quantity: 6,
      unit: null,
      shopId: null,
      url: null,
      note: null,
      priceCents: null,
      category: null,
      imageUrl: null,
    });
  });

  it("keeps what was filled in", () => {
    const parsed = shoppingItemEditSchema.parse({
      name: "Glas",
      priceCents: "399",
      category: "household",
      url: "https://www.ikea.com/be/nl/p/dyrgrip-rodewijnglas-helder-glas-20309300/",
      imageUrl: "https://www.ikea.com/be/nl/images/products/glas.jpg",
    });
    const update = editToUpdate(parsed);
    assert.equal(update.priceCents, 399);
    assert.equal(update.category, "household");
    assert.equal(update.imageUrl, "https://www.ikea.com/be/nl/images/products/glas.jpg");
  });
});

describe("estimateTotal", () => {
  it("price × quantity of the priced items, and how many have no price", () => {
    assert.deepEqual(estimateTotal([{ priceCents: 399, quantity: 6 }, { priceCents: 1250, quantity: 1 }, { priceCents: null, quantity: 2 }]), {
      cents: 3644,
      priced: 2,
      unpriced: 1,
    });
    assert.deepEqual(estimateTotal([]), { cents: 0, priced: 0, unpriced: 0 });
  });
});
