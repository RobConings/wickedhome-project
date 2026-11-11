import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareNeed, convertAmount, stockUnitsPer, unitInfo, type UnitDefinition } from "./units";
import { unitCatalogueInputSchema } from "./unit-catalogue";

const bottle: UnitDefinition = { name: "fles 75 cl", aliases: ["flesje 75 cl"], referenceUnit: "cl", factor: 75, rounding: 1 };
const head: UnitDefinition = { name: "stronkje", aliases: ["stronkjes"], referenceUnit: "g", factor: 150, rounding: 1 };
const product = (unit: string, units: UnitDefinition[] = []) => ({ unit, packageAmount: null, packageUnit: null, units });

describe("shared units and references", () => {
  it("converts 75 cl bottles to volume, in both directions, through aliases", () => {
    assert.equal(convertAmount(2, "fles 75 cl", "l", [bottle]), 1.5);
    assert.equal(convertAmount(1.5, "l", "flesje 75 cl", [bottle]), 2);
    const need = compareNeed({ quantity: 1, unit: "l" }, 1, 1, product("fles 75 cl", [bottle]));
    assert.equal(need.stockInRecipeUnit, 0.75);
    assert.equal(need.shortfallPackages, 1, "buy a whole bottle using the configured increment");
    assert.equal(convertAmount(2, "flesje", "l", [{ ...bottle, name: "fles", aliases: [] }]), 1.5);
  });
  it("resolves relations through other custom units, without leaking across households", () => {
    const crate: UnitDefinition = { name: "krat", aliases: [], referenceUnit: bottle.name, factor: 6, rounding: 1 };
    assert.equal(convertAmount(1, "krat", "ml", [crate, bottle]), 4500);
    assert.equal(convertAmount(1, bottle.name, "l", []), null);
    assert.equal(convertAmount(1, bottle.name, "l", [{ ...bottle, factor: 33 }]), 0.33);
  });
  it("can define a central head-to-weight relation and a bag-to-piece relation", () => {
    const need = compareNeed({ quantity: 8, unit: "stronkje" }, 1, 0, product("kg", [head]));
    assert.equal(need.neededInStockUnits, 1.2);
    assert.equal(need.shortfallPackages, 1.2);
    const bag = { name: "zak uien", aliases: [], referenceUnit: "stuk", factor: 12, rounding: 1 };
    assert.equal(stockUnitsPer("stuk", product("zak uien", [bag])), 1 / 12);
    assert.equal(compareNeed({ quantity: 4, unit: "stuk" }, 1, 1, product("zak uien", [bag])).status, "in_stock");
  });
  it("never treats one unconfigured bag as one onion; zero is a shortage even across incompatible units", () => {
    const onions = compareNeed({ quantity: 4, unit: "stuk" }, 1, 1, product("zak"));
    assert.equal(onions.status, "unknown_amount");
    assert.equal(onions.shortfallPackages, null);
    const chicory = compareNeed({ quantity: 8, unit: "stronkje" }, 1, 0, product("kg"));
    assert.equal(chicory.status, "short");
    assert.equal(chicory.comparable, false);
    assert.equal(chicory.shortfallPackages, null, "no invented kg quantity");
  });
  it("rejects circular, unknown and duplicate references and redefinition of standard measures", () => {
    const valid = (units: unknown[]) => unitCatalogueInputSchema.safeParse({ expectedUpdatedAt: null, units }).success;
    assert.equal(valid([bottle, head]), true);
    assert.equal(valid([{ ...bottle, referenceUnit: bottle.name }]), false);
    assert.equal(valid([{ ...bottle, referenceUnit: "missing" }]), false);
    assert.equal(valid([bottle, { ...bottle, name: "another bottle" }]), false);
    assert.equal(valid([{ ...bottle, name: "kg" }]), false);
    assert.equal(valid([{ ...bottle, referenceUnit: "zak" }]), false);
    assert.equal(valid([{ ...bottle, name: "a", aliases: [], referenceUnit: "b" }, { ...bottle, name: "b", aliases: [], referenceUnit: "a" }]), false);
    assert.equal(unitInfo("a", [{ ...bottle, name: "a", aliases: [], referenceUnit: "a" }]), null);
  });
});
