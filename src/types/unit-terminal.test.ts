import assert from "node:assert/strict";
import { it } from "node:test";
import { unitCatalogueInputSchema, readUnitDefinitions } from "./unit-catalogue";
import { linkedUnits, unitOverview } from "./unit-overview";
import { compareNeed, convertAmount, standardUnitSetting, stockUnitsPer, terminalBlocksConversion, type UnitDefinition } from "./units";

const unit = (name: string, referenceUnit: string, factor: number, isTerminal?: boolean): UnitDefinition => ({ name, referenceUnit, factor, rounding: 1, aliases: [], ...(isTerminal === undefined ? {} : { isTerminal }) });
const stock = (name: string | null, units: UnitDefinition[], packageUnit: string | null = null, packageAmount: number | null = null) => ({ unit: name, units, packageUnit, packageAmount });
const piece = standardUnitSetting("stuk", true)!;

it("persists end units, preserves old catalogues and locks standard-unit ratios", () => {
  const parse = (units: UnitDefinition[]) => unitCatalogueInputSchema.safeParse({ expectedUpdatedAt: null, units });
  assert.equal(parse([piece]).success, true);
  assert.deepEqual(readUnitDefinitions([piece]), [piece]);
  const old = unit("doos eieren", "stuk", 6);
  assert.deepEqual(readUnitDefinitions([old]), [old]);
  assert.equal(parse([{ ...piece, factor: 2 }]).success, false);
  assert.equal(parse([{ ...piece, referenceUnit: "g" }]).success, false);
  assert.equal(parse([{ ...piece, aliases: ["egg"] }]).success, false);
  assert.equal(parse([{ ...piece, name: "pcs", referenceUnit: "pcs" }]).success, false);
  assert.equal(parse([{ ...piece, rounding: 2 }]).success, false);
  assert.equal(parse([{ ...piece, isTerminal: undefined }]).success, false);
  assert.equal(parse([piece, { ...piece, isTerminal: false }]).success, false);
  assert.equal(parse([standardUnitSetting("zak", true)!, unit("krat zakken", "zak", 6)]).success, false, "a terminal setting does not invent container content");
  const nodes = unitOverview([piece]);
  assert.equal(nodes.filter((node) => node.name === "stuk").length, 1);
  assert.equal(nodes.find((node) => node.name === "stuk")!.source, "standard");
  assert.equal(nodes.find((node) => node.name === "stuk")!.isTerminal, true);
  assert.ok(nodes.find((node) => node.name === "stuk")!.aliases.includes("pcs"));
  const hundred = Array.from({ length: 100 }, (_, index) => unit(`eenheid ${index}`, "g", 1));
  assert.equal(parse([...hundred, piece]).success, true);
  assert.equal(parse([...hundred, unit("extra", "g", 1)]).success, false);
});

it("blocks sibling branches through an end unit while keeping either endpoint reachable", () => {
  const definitions = [unit("doos eieren", "stuk", 6), unit("zak appels", "pcs", 12), unit("pallet eieren", "doos eieren", 10), piece];
  assert.equal(convertAmount(1, "doos eieren", "zak appels", definitions), null);
  assert.equal(convertAmount(1, "zak appels", "doos eieren", definitions), null);
  assert.equal(convertAmount(1, "doos eieren", "St.", definitions), 6);
  assert.equal(convertAmount(6, "pcs", "doos eieren", definitions), 1);
  assert.equal(convertAmount(1, "pallet eieren", "stuk", definitions), 60);
  assert.equal(stockUnitsPer("doos eieren", stock("zak appels", definitions)), null);
  assert.equal(stockUnitsPer("doos eieren", stock("pcs", definitions)), 6);
  assert.equal(stockUnitsPer("doos eieren", stock(null, definitions)), 6);
  const links = linkedUnits("pallet eieren", definitions)!.links;
  assert.ok(links.some((link) => link.unit.name === "stuk"));
  assert.ok(links.some((link) => link.unit.name === "doos eieren"));
  assert.ok(!links.some((link) => link.unit.name === "zak appels"));
  assert.ok(linkedUnits("stuk", definitions)!.links.some((link) => link.unit.name === "zak appels"));
  assert.equal(convertAmount(1, "doos eieren", "zak appels", definitions.filter((entry) => entry !== piece)), 0.5);
  assert.equal(convertAmount(1, "doos eieren", "zak appels", [...definitions.filter((entry) => entry !== piece), { ...piece, isTerminal: false }]), 0.5);
});

it("stops transit through a custom middle node in either direction and honours aliases", () => {
  const definitions = [{ ...unit("fles 75 cl", "cl", 75, true), aliases: ["wijnfles"] }, unit("krat wijn", "wijnfles", 6), unit("doos wijn", "fles 75 cl", 12), unit("pallet wijn", "krat wijn", 10)];
  assert.equal(convertAmount(1, "krat wijn", "l", definitions), null);
  assert.equal(convertAmount(1, "l", "pallet wijn", definitions), null);
  assert.equal(convertAmount(1, "krat wijn", "doos wijn", definitions), null);
  assert.equal(convertAmount(1, "krat wijn", "wijnfles", definitions), 6);
  assert.equal(convertAmount(1, "wijnfles", "l", definitions), 0.75);
  assert.equal(convertAmount(1, "pallet wijn", "krat wijn", definitions), 10);
  assert.ok(!linkedUnits("krat wijn", definitions)!.links.some((link) => link.unit.name === "ml"));
  assert.ok(linkedUnits("wijnfles", definitions)!.links.some((link) => link.unit.name === "pallet wijn"));
});

it("cannot bypass an end unit with legacy count fallbacks or a product package bridge", () => {
  const definitions = [unit("doos eieren", "stuk", 6), piece];
  assert.equal(stockUnitsPer("doos eieren", stock("pack", definitions, "pcs", 12)), null);
  assert.equal(convertAmount(1, "doos eieren", "pack", definitions), null);
  const grams = [standardUnitSetting("g", true)!];
  assert.equal(stockUnitsPer("kg", stock("pack", grams, "g", 200)), null);
  assert.equal(stockUnitsPer("g", stock("pack", grams, "g", 200)), 0.005, "end unit itself remains a valid source");
  assert.equal(stockUnitsPer("kg", stock("pack", grams, "kg", 0.2)), 5, "do not climb through g beyond the actual target");
  assert.equal(stockUnitsPer("mg", stock("kg", grams)), null);
  assert.equal(convertAmount(1, "g", "mg", grams), 1000);
});

it("keeps zero empty and reports positive blocked comparisons as unknown quantities", () => {
  const definitions = [unit("doos eieren", "stuk", 6), unit("zak appels", "stuk", 12), piece];
  const product = stock("zak appels", definitions);
  assert.equal(compareNeed({ quantity: 1, unit: "doos eieren" }, 1, 0, product).status, "short");
  assert.equal(compareNeed({ quantity: 1, unit: "doos eieren" }, 1, 1, product).status, "unknown_amount");
});

it("supports deep branching paths and blocks only interior terminals on the actual path", () => {
  const definitions = Array.from({ length: 95 }, (_, i) => unit(`laag ${i}`, i ? `laag ${i - 1}` : "g", 1, i === 40));
  definitions.push(unit("tak", "laag 20", 2));
  assert.equal(terminalBlocksConversion("laag 94", "g", definitions), true);
  assert.equal(convertAmount(1, "laag 94", "tak", definitions), null);
  assert.equal(convertAmount(1, "laag 94", "laag 40", definitions), 1);
  assert.equal(convertAmount(1, "laag 94", "laag 80", definitions), 1);
  assert.equal(convertAmount(1, "laag 40", "tak", definitions), 0.5);
  assert.equal(terminalBlocksConversion("laag 94", "laag 80", definitions), false);
});
