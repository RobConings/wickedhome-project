import assert from "node:assert/strict";
import { it } from "node:test";
import { findOverviewUnit, linkedUnits, unitOverview } from "./unit-overview";
import { standardUnits, unitInfo, type UnitDefinition } from "./units";

const definitions: UnitDefinition[] = [
  { name: "fles 75 cl", aliases: ["wijnfles"], referenceUnit: "cl", factor: 75, rounding: 1 },
  { name: "krat wijn", aliases: [], referenceUnit: "wijnfles", factor: 6, rounding: 1 },
  { name: "ton", aliases: ["tonne"], referenceUnit: "kg", factor: 1000, rounding: 0.001 },
];

it("lists existing measures and their spellings from the calculation engine", () => {
  const units = standardUnits();
  for (const name of ["mg", "g", "kg", "ml", "cl", "dl", "l", "stuk", "pack", "doos", "fles", "blik", "pot", "tube", "zak", "tray", "schaal", "bakje", "rol", "tros"]) assert.ok(units.some((unit) => unit.name === name), name);
  const names = units.flatMap((unit) => [unit.name, ...unit.aliases]);
  assert.equal(new Set(names).size, names.length);
  for (const unit of units) for (const name of [unit.name, ...unit.aliases]) assert.deepEqual(unitInfo(name), unitInfo(unit.name), name);
  assert.equal(findOverviewUnit("grammes", unitOverview([]))?.name, "g");
  assert.equal(findOverviewUnit("flessen", unitOverview([]))?.name, "fles");
});

it("finds direct, reverse and indirect references, including aliases and small exact ratios", () => {
  const wine = linkedUnits("wijnfles", definitions)!;
  assert.equal(wine.unit.name, "fles 75 cl");
  const litre = wine.links.find((link) => link.unit.name === "l")!;
  assert.equal(litre.factor, 0.75);
  assert.deepEqual(litre.path, ["fles 75 cl", "cl", "ml", "l"]);
  assert.equal(litre.direct, false);
  const crate = wine.links.find((link) => link.unit.name === "krat wijn")!;
  assert.equal(crate.factor, 1 / 6); assert.equal(crate.direct, true);
  assert.equal(linkedUnits("krat wijn", definitions)!.links.find((link) => link.unit.name === "l")!.factor, 4.5);
  assert.deepEqual(linkedUnits("kg", definitions)!.links.find((link) => link.unit.name === "ton")!.path, ["kg", "ton"]);
  assert.equal(linkedUnits("mg", definitions)!.links.find((link) => link.unit.name === "ton")!.factor, 1e-9);
});

it("separates dimensions and unconfigured containers from pieces and from each other", () => {
  assert.equal(linkedUnits("unknown", definitions), null);
  assert.equal(linkedUnits("", definitions), null);
  assert.deepEqual(linkedUnits("zakken", definitions)!.links, []);
  assert.equal(linkedUnits("zak", definitions)!.unit.needsDefinition, true);
  assert.deepEqual(linkedUnits("stuk", definitions)!.links, []);
  assert.ok(linkedUnits("g", definitions)!.links.every((link) => link.unit.dimension === "mass"));
  const boxes = [{ name: "doos van 6", referenceUnit: "stuk", factor: 6, rounding: 1, aliases: [] }];
  assert.equal(linkedUnits("stuk", boxes)!.links[0]!.factor, 1 / 6);
  assert.ok(!linkedUnits("stuk", boxes)!.links.some((link) => link.unit.name === "doos"));
});

it("honours configured container identities without duplicate built-in rows or aliases", () => {
  const custom = [{ name: "wijnfles", referenceUnit: "cl", factor: 75, rounding: 1, aliases: ["fles"] }];
  const overview = unitOverview(custom);
  assert.ok(!overview.some((unit) => unit.source === "standard" && unit.name === "fles"));
  assert.equal(findOverviewUnit("flessen", overview)?.name, "wijnfles");
  assert.equal(linkedUnits("flesje", custom)!.links.find((link) => link.unit.name === "l")!.factor, 0.75);
  // Exact-name containers such as pack do not shadow unrelated spellings in the calculation engine.
  const pack = unitOverview([{ name: "pack", referenceUnit: "g", factor: 250, rounding: 1, aliases: [] }]);
  assert.equal(findOverviewUnit("pack", pack)?.source, "custom");
  assert.equal(findOverviewUnit("pak", pack)?.source, "standard");
});

it("never follows corrupt cyclic, missing or overflowing references", () => {
  for (const input of [
    [{ name: "loop", referenceUnit: "loop", factor: 1, rounding: 1, aliases: [] }],
    [{ name: "missing", referenceUnit: "unknown", factor: 1, rounding: 1, aliases: [] }],
    [{ name: "huge", referenceUnit: "kg", factor: Infinity, rounding: 1, aliases: [] }],
  ]) assert.deepEqual(linkedUnits(input[0]!.name, input)!.links, []);
});

it("includes existing free-text units without guessing a conversion or duplicating known spellings", () => {
  const usage = ["Stronkje", "stronkje.", "kg", "gram", "flesjes", "", "  ", "wijnfles"];
  const overview = unitOverview(definitions, usage);
  const used = overview.filter((unit) => unit.source === "used");
  assert.equal(used.length, 1); assert.equal(used[0]!.name, "Stronkje");
  assert.equal(used[0]!.needsDefinition, true);
  assert.deepEqual(linkedUnits("stronkje", definitions, usage)!.links, []);
  const configured = [...definitions, { name: "stronkje", referenceUnit: "g", factor: 150, rounding: 1, aliases: [] }];
  assert.equal(unitOverview(configured, usage).filter((unit) => unit.name.toLowerCase() === "stronkje").length, 1);
  assert.equal(findOverviewUnit("stronkje", unitOverview(configured, usage))!.source, "custom");
  assert.equal(linkedUnits("stronkje", configured, usage)!.links.find((link) => link.unit.name === "kg")!.factor, 0.15);
});
