/**
 * Unit tests for product alternatives (shared stock): which product owns the stock, which links are
 * refused, how an alternative's stock merges into its main product's and who takes over a deleted main
 * product. No database. Run on the server:
 *
 *   npx tsx --test src/api/shopping/product-alternatives.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  linkProblem,
  mergeNote,
  mergeStockValues,
  planStockMerge,
  promotionCandidate,
  stockOwnerOf,
  type MergeableStock,
} from "./product-alternatives";

const stock = (id: string, placeId: string, quantity: number, extra: Partial<MergeableStock> = {}): MergeableStock => ({
  id,
  placeId,
  quantity,
  unit: null,
  minQuantity: null,
  expiresOn: null,
  ...extra,
});

describe("stockOwnerOf", () => {
  it("is the main product for an alternative", () => {
    assert.equal(stockOwnerOf({ id: "delhaize-bacon", stockProductId: "bacon" }), "bacon");
  });

  it("is the product itself otherwise", () => {
    assert.equal(stockOwnerOf({ id: "bacon", stockProductId: null }), "bacon");
  });
});

describe("linkProblem", () => {
  it("refuses linking a product to itself", () => {
    assert.equal(linkProblem({ id: "a", stockProductId: null }, { id: "a", stockProductId: null }), "same_product");
  });

  it("refuses products that already share stock", () => {
    assert.equal(linkProblem({ id: "a", stockProductId: "main" }, { id: "main", stockProductId: null }), "already_linked");
    assert.equal(linkProblem({ id: "a", stockProductId: "main" }, { id: "b", stockProductId: "main" }), "already_linked");
    assert.equal(linkProblem({ id: "main", stockProductId: null }, { id: "b", stockProductId: "main" }), "already_linked");
  });

  it("allows products of different groups, also when the chosen one is an alternative", () => {
    assert.equal(linkProblem({ id: "a", stockProductId: null }, { id: "b", stockProductId: null }), null);
    assert.equal(linkProblem({ id: "a", stockProductId: null }, { id: "b", stockProductId: "other" }), null);
  });
});

describe("mergeStockValues", () => {
  it("sums quantities, keeps the higher minimum and the earliest expiry", () => {
    assert.deepEqual(
      mergeStockValues(
        { quantity: 1.5, unit: "pack", minQuantity: 1, expiresOn: "2026-11-01" },
        { quantity: 2.25, unit: "pcs", minQuantity: 3, expiresOn: "2026-10-20" },
      ),
      { quantity: 3.75, unit: "pack", minQuantity: 3, expiresOn: "2026-10-20" },
    );
  });

  it("keeps whichever minimum, expiry and unit is set", () => {
    assert.deepEqual(
      mergeStockValues({ quantity: 0, unit: null, minQuantity: null, expiresOn: null }, { quantity: 2, unit: "kg", minQuantity: 2, expiresOn: "2027-01-01" }),
      { quantity: 2, unit: "kg", minQuantity: 2, expiresOn: "2027-01-01" },
    );
    assert.deepEqual(
      mergeStockValues({ quantity: 1, unit: null, minQuantity: 4, expiresOn: "2026-12-24" }, { quantity: 0, unit: null, minQuantity: null, expiresOn: null }),
      { quantity: 1, unit: null, minQuantity: 4, expiresOn: "2026-12-24" },
    );
  });

  it("rounds to three decimals", () => {
    assert.equal(mergeStockValues({ quantity: 0.1, unit: null, minQuantity: null, expiresOn: null }, { quantity: 0.2, unit: null, minQuantity: null, expiresOn: null }).quantity, 0.3);
  });
});

describe("planStockMerge", () => {
  it("moves stock at places the main product isn't kept and merges the rest", () => {
    const steps = planStockMerge(
      [stock("s-fridge", "fridge", 2, { minQuantity: 1 }), stock("s-freezer", "freezer", 4)],
      [stock("t-fridge", "fridge", 1, { minQuantity: 2, expiresOn: "2026-10-12" }), stock("t-pantry", "pantry", 3)],
    );
    assert.deepEqual(steps, [
      { kind: "merge", sourceId: "s-fridge", targetId: "t-fridge", placeId: "fridge", added: 2, quantity: 3, unit: null, minQuantity: 2, expiresOn: "2026-10-12" },
      { kind: "move", sourceId: "s-freezer", placeId: "freezer", quantity: 4 },
    ]);
  });

  it("does nothing without stock to move", () => {
    assert.deepEqual(planStockMerge([], [stock("t", "pantry", 1)]), []);
  });
});

describe("promotionCandidate", () => {
  it("takes the oldest alternative, then by name", () => {
    const at = (iso: string) => new Date(iso);
    const heir = promotionCandidate([
      { id: "b", name: "Delhaize", createdAt: at("2026-10-02T10:00:00Z") },
      { id: "a", name: "Colruyt", createdAt: at("2026-10-02T10:00:00Z") },
      { id: "c", name: "Aldi", createdAt: at("2026-10-05T10:00:00Z") },
    ]);
    assert.equal(heir?.id, "a");
  });

  it("is undefined without alternatives", () => {
    assert.equal(promotionCandidate([]), undefined);
  });
});

describe("mergeNote", () => {
  it("is written in the member's language", () => {
    assert.equal(mergeNote("Delhaize spek", "en"), "Merged from Delhaize spek");
    assert.equal(mergeNote("Delhaize spek", "nl"), "Samengevoegd uit Delhaize spek");
  });
});
