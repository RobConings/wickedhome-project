/** Units: dimensions, conversions and comparing a recipe's need with stock counted in packages. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareNeed, convertAmount, isCountUnit, stockUnitsPer, toStockUnits, unitInfo } from "./units";

const pack = (packageAmount: number | null, packageUnit: string | null, unit: string | null = "pack") => ({ unit, packageAmount, packageUnit });

describe("units", () => {
  it("knows mass, volume and count units in Dutch and English, ignoring case and a dot", () => {
    assert.deepEqual(unitInfo("KG"), { dimension: "mass", factor: 1000 });
    assert.deepEqual(unitInfo("gr."), { dimension: "mass", factor: 1 });
    assert.deepEqual(unitInfo(" Liter "), { dimension: "volume", factor: 1000 });
    assert.equal(unitInfo("St.")?.dimension, "count");
    assert.equal(isCountUnit(null), true);
    assert.equal(isCountUnit("pakje"), true);
    for (const unit of ["el", "tl", "snuifje", "teentje", "handvol"]) assert.equal(unitInfo(unit), null, unit);
  });

  it("converts within a dimension only", () => {
    assert.equal(convertAmount(1.5, "kg", "g"), 1500);
    assert.equal(convertAmount(33, "cl", "l"), 0.33);
    assert.equal(convertAmount(1, "kg", "l"), null);
  });

  it("finds stock units per unit: direct, via the package size, or not at all", () => {
    assert.equal(stockUnitsPer("pcs", pack(null, null)), 1, "count against packs compares directly");
    assert.equal(stockUnitsPer("kg", pack(null, null, "g")), 1000, "the product counts grams");
    assert.equal(toStockUnits(300, "g", pack(200, "g")), 1.5);
    assert.equal(stockUnitsPer("g", pack(null, null)), null, "no package size");
    assert.equal(stockUnitsPer("g", pack(1, "l")), null, "another dimension");
    assert.equal(stockUnitsPer("el", pack(200, "g")), null);
  });
});

describe("compareNeed", () => {
  it("300 g against 1 pack of 200 g: short 100 g, buy 1 pack", () => {
    assert.deepEqual(compareNeed({ quantity: 300, unit: "g" }, 1, 1, pack(200, "g")), {
      needed: 300,
      neededInStockUnits: 1.5,
      stockInRecipeUnit: 200,
      shortfall: 100,
      shortfallPackages: 1,
      comparable: true,
      status: "short",
    });
  });

  it("1 l against a 6 x 33 cl multipack (198 cl per package) is in stock", () => {
    const result = compareNeed({ quantity: 1, unit: "l" }, 1, 1, pack(198, "cl"));
    assert.equal(result.status, "in_stock");
    assert.equal(result.stockInRecipeUnit, 1.98);
    assert.equal(result.shortfallPackages, 0);
  });

  it("scales by servings and rounds whole things up", () => {
    assert.deepEqual(
      [compareNeed({ quantity: 3, unit: "pcs" }, 1.5, 2, pack(null, null)).needed, compareNeed({ quantity: 3, unit: "pcs" }, 1.5, 2, pack(null, null)).shortfallPackages],
      [5, 3],
    );
    assert.equal(compareNeed({ quantity: 1, unit: "pack" }, 0.25, 0, pack(null, null)).needed, 1, "never less than one");
    assert.equal(compareNeed({ quantity: 250, unit: "g" }, 1.5, 0, pack(500, "g")).needed, 375);
  });

  it("pcs against packs compares directly; buying fractional stock rounds up to whole packs", () => {
    const result = compareNeed({ quantity: 2, unit: "pcs" }, 1, 0.5, pack(null, null));
    assert.equal(result.status, "short");
    assert.equal(result.shortfallPackages, 2);
  });

  it("2 el doesn't convert: unknown amount, never a shortfall in the wrong unit", () => {
    const result = compareNeed({ quantity: 2, unit: "el" }, 1, 3, pack(200, "g"));
    assert.equal(result.status, "unknown_amount");
    assert.equal(result.comparable, false);
    assert.equal(result.shortfall, null);
    assert.equal(result.stockInRecipeUnit, null);
    assert.equal(compareNeed({ quantity: 300, unit: "g" }, 1, 1, pack(null, null)).status, "unknown_amount", "no package size");
  });

  it("a product not kept in stock still says what to buy; no product is unknown", () => {
    const notKept = compareNeed({ quantity: 300, unit: "g" }, 1, null, pack(200, "g"));
    assert.equal(notKept.status, "not_kept");
    assert.equal(notKept.shortfallPackages, 2);
    assert.equal(compareNeed({ quantity: 1, unit: null }, 1, null, null).status, "unknown");
  });

  it("a product counted in grams buys the missing grams", () => {
    const result = compareNeed({ quantity: 0.5, unit: "kg" }, 1, 200, pack(null, null, "g"));
    assert.equal(result.shortfallPackages, 300);
    assert.equal(result.shortfall, 0.3);
  });
});
