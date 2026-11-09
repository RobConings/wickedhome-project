import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkedGroupMembers, previewSharedStockLink } from "./shared-stock-group-preview";

const products = [
  { id: "boter", name: "Boter", stockProductId: null },
  { id: "boni", name: "Boni Bakboter 250 g", stockProductId: "boter" },
  { id: "alpro", name: "Alpro bakken & braden 500 g", stockProductId: null },
  { id: "fama", name: "FAMA bakken & braden 500 g", stockProductId: "alpro" },
  { id: "other", name: "Mayonaise", stockProductId: null },
];

describe("preparing a shared-stock group merge", () => {
  it("shows all linked products, not just the selected FAMA variant", () => {
    const preview = previewSharedStockLink(products[0]!, products[3]!, products);
    assert.equal(preview.needsConfirmation, true);
    assert.deepEqual(preview.currentMembers.map((p) => p.id), ["boter", "boni"]);
    assert.deepEqual(preview.selectedMembers.map((p) => p.id), ["alpro", "fama"]);
    assert.deepEqual(preview.allMembers.map((p) => p.id), ["boter", "boni", "alpro", "fama"]);
  });

  it("requires confirmation when just the destination already has alternatives", () => {
    assert.equal(previewSharedStockLink(products[0]!, products[4]!, products).needsConfirmation, true);
  });

  it("allows direct linking of two ungrouped products without additional confirmation", () => {
    assert.equal(previewSharedStockLink(products[2]!, products[4]!, products).needsConfirmation, false);
  });

  it("resolves a selected variant to its owner even if the owner is not the selected product", () => {
    assert.deepEqual(linkedGroupMembers(products[3]!, products).map((p) => p.id), ["alpro", "fama"]);
  });
});
