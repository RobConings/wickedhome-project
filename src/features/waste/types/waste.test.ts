/**
 * Unit tests for waste fraction normalisation and provider suggestions. Run: npx tsx --test src/features/waste/types/waste.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareWasteCollections,
  normaliseFraction,
  suggestWasteProvider,
  wasteDayTitle,
  wasteTiming,
  type WasteProviderInfo,
} from "./waste";

describe("normaliseFraction", () => {
  const cases: [string, string][] = [
    // Limburg.net
    ["Huisvuil", "residual"],
    ["Gft ", "organic"],
    ["Keukenafval", "organic"],
    ["Pmd", "pmd"],
    ["Papier & karton", "paper"],
    ["Textiel", "textile"],
    ["Tuinafval", "garden"],
    // Recycle! (nl, fr, en)
    ["Restafval", "residual"],
    ["gft", "organic"],
    ["PMD", "pmd"],
    ["P+MD", "pmd"],
    ["Papier-karton", "paper"],
    ["Glas (IVAGO)", "glass"],
    ["Grofvuil op aanvraag", "bulky"],
    ["Snoeihout", "garden"],
    ["Déchets ménagers résiduels", "residual"],
    ["Déchets organiques", "organic"],
    ["PMC", "pmd"],
    ["Papiers-cartons", "paper"],
    ["Verre", "glass"],
    ["Encombrants", "bulky"],
    ["Residual household waste", "residual"],
    ["Groente-, fruit- en tuinafval", "organic"],
    ["Kerstbomen", "other"],
  ];
  for (const [label, fraction] of cases) {
    it(`${label} → ${fraction}`, () => assert.equal(normaliseFraction(label), fraction));
  }
});

describe("suggestWasteProvider", () => {
  const providers: WasteProviderInfo[] = [
    { id: "limburg-net", name: "Limburg.net", website: "", postalCodeRanges: [[3500, 3999]], checksCoverage: false },
    { id: "recycle-app", name: "Recycle!", website: "", postalCodeRanges: null, checksCoverage: true },
  ];
  it("suggests Limburg.net in Limburg", () => {
    assert.equal(suggestWasteProvider("3500", providers), "limburg-net");
    assert.equal(suggestWasteProvider("3999", providers), "limburg-net");
  });
  it("suggests Recycle! elsewhere", () => {
    assert.equal(suggestWasteProvider("9000", providers), "recycle-app");
    assert.equal(suggestWasteProvider("1000", providers), "recycle-app");
    assert.equal(suggestWasteProvider("3499", providers), "recycle-app");
  });
  it("suggests nothing without a valid postal code", () => {
    assert.equal(suggestWasteProvider(null, providers), null);
    assert.equal(suggestWasteProvider("35", providers), null);
  });
});

describe("collection days", () => {
  it("names the timing relative to today", () => {
    assert.equal(wasteTiming("2026-10-02", "2026-10-02", "2026-10-03"), "today");
    assert.equal(wasteTiming("2026-10-03", "2026-10-02", "2026-10-03"), "tomorrow");
    assert.equal(wasteTiming("2026-10-09", "2026-10-02", "2026-10-03"), "later");
  });
  it("titles a day with the provider labels, sorted by fraction", () => {
    const collections = [
      { fraction: "paper" as const, label: "Papier & karton" },
      { fraction: "pmd" as const, label: "Pmd " },
    ].sort(compareWasteCollections);
    assert.equal(wasteDayTitle(collections), "Pmd + Papier & karton");
  });
});
