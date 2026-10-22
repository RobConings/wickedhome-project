/**
 * Unit tests for the waste provider parsers, with trimmed real responses (October 2026). No network.
 * Run: npx tsx --test src/api/waste/providers/providers.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monthsBetween, parseLimburgCalendar, type LimburgCalendarResponse } from "./limburg-net";
import { splitHouseNumber, sameName } from "./provider";
import { collectionDate, languageFor, parseRecycleCollections, type RecycleCollectionsResponse } from "./recycle-app";

describe("Limburg.net", () => {
  const body: LimburgCalendarResponse = {
    activiteitenLegende: {
      "5": { nummer: "5", omschrijving: "Gft " },
      "14": { nummer: "14", omschrijving: "Papier & karton" },
      "22": { nummer: "22", omschrijving: "Pmd" },
      "27": { nummer: "27", omschrijving: "Huisvuil" },
      "29": { nummer: "29", omschrijving: "Keukenafval" },
    },
    ophalingen: {
      lijstVanOphaalDagen: [
        { datum: "2026-10-06T21:00:03+02:00", activiteitCode: "27", displayCode: 1, displayReden: "" },
        { datum: "2026-10-06T21:00:03+02:00", activiteitCode: "29", displayCode: 1, displayReden: "" },
        { datum: "2026-10-06T21:00:03+02:00", activiteitCode: "29", displayCode: 1, displayReden: "" },
        { datum: "2026-10-07T21:00:03+02:00", activiteitCode: "14", displayCode: 1, displayReden: "Verplaatst" },
        { datum: "2026-10-27T21:00:03+01:00", activiteitCode: "22", displayCode: 1, displayReden: "" },
        { datum: "2026-10-27T21:00:03+01:00", activiteitCode: "99", displayCode: 1, displayReden: "" },
      ],
    },
  };

  it("parses collections with normalised fractions, de-duplicated, within the range", () => {
    const collections = parseLimburgCalendar(body, "2026-10-01", "2026-10-26");
    assert.deepEqual(collections, [
      { date: "2026-10-06", fraction: "residual", providerKey: "27", label: "Huisvuil", color: null, note: null },
      { date: "2026-10-06", fraction: "organic", providerKey: "29", label: "Keukenafval", color: null, note: null },
      { date: "2026-10-07", fraction: "paper", providerKey: "14", label: "Papier & karton", color: null, note: "Verplaatst" },
    ]);
  });

  it("keeps the local date across the DST change and labels unknown codes", () => {
    const collections = parseLimburgCalendar(body, "2026-10-27", "2026-10-31");
    assert.deepEqual(
      collections.map((collection) => [collection.date, collection.label, collection.fraction]),
      [
        ["2026-10-27", "Pmd", "pmd"],
        ["2026-10-27", "Fractie 99", "other"],
      ],
    );
  });

  it("tolerates an empty month (next year not published yet)", () => {
    assert.deepEqual(parseLimburgCalendar({ ophalingen: { lijstVanOphaalDagen: [] } }, "2027-01-01", "2027-01-31"), []);
    assert.deepEqual(parseLimburgCalendar({}, "2027-01-01", "2027-01-31"), []);
  });

  it("lists the months of a range", () => {
    assert.deepEqual(monthsBetween("2026-11-25", "2027-02-03"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
    assert.deepEqual(monthsBetween("2026-10-02", "2026-10-30"), ["2026-10"]);
  });
});

describe("Recycle!", () => {
  const pmd = { id: "5e4e84d1bab65e8432d714ea", name: { nl: "PMD", fr: "PMC", en: "PMD" }, color: "#66C3FA" };
  const rest = { id: "5ed796808e14e77b4ac5ff32", name: { nl: "Restafval", fr: "Déchets résiduels", en: "Residual household waste" }, color: "#767676" };
  const body: RecycleCollectionsResponse = {
    items: [
      { type: "collection", timestamp: "2026-10-05T00:00:00.000Z", fraction: pmd },
      { type: "collection", timestamp: "2026-10-05T00:00:00.000Z", fraction: pmd },
      { type: "collection", timestamp: "2026-10-11T22:00:00.000Z", fraction: rest },
      { type: "collection", timestamp: "2026-10-19T00:00:00.000Z", fraction: rest, exception: { replacedBy: { id: "x" } } },
      { type: "collection", timestamp: "2026-10-20T00:00:00.000Z", fraction: rest, exception: { replaces: { id: "y" }, reason: { name: { nl: "Feestdag" } } } },
      { type: "event", timestamp: "2026-10-21T00:00:00.000Z" },
    ],
  };

  it("parses collections in the household's language, skipping moved-away days and events", () => {
    assert.deepEqual(parseRecycleCollections(body, "nl"), [
      { date: "2026-10-05", fraction: "pmd", providerKey: pmd.id, label: "PMD", color: "#66c3fa", note: null },
      { date: "2026-10-12", fraction: "residual", providerKey: rest.id, label: "Restafval", color: "#767676", note: null },
      { date: "2026-10-20", fraction: "residual", providerKey: rest.id, label: "Restafval", color: "#767676", note: "Feestdag" },
    ]);
    assert.equal(parseRecycleCollections(body, "fr")[0]?.label, "PMC");
  });

  it("reads the collection day from UTC or Brussels midnight", () => {
    assert.equal(collectionDate("2026-10-05T00:00:00.000Z"), "2026-10-05");
    assert.equal(collectionDate("2026-10-04T22:00:00.000Z"), "2026-10-05");
    assert.equal(collectionDate("2026-11-30T23:00:00.000Z"), "2026-12-01");
    assert.equal(collectionDate("nonsense"), null);
  });

  it("picks French labels in Wallonia", () => {
    assert.equal(languageFor("9000"), "nl");
    assert.equal(languageFor("1000"), "nl");
    assert.equal(languageFor("1400"), "fr");
    assert.equal(languageFor("5000"), "fr");
  });
});

describe("address helpers", () => {
  it("splits a house number and its addition", () => {
    assert.deepEqual(splitHouseNumber("100A"), { number: "100", suffix: "A" });
    assert.deepEqual(splitHouseNumber(" 13 b"), { number: "13", suffix: "B" });
    assert.deepEqual(splitHouseNumber("12-14"), { number: "12-14", suffix: "" });
  });
  it("compares names loosely", () => {
    assert.equal(sameName("Kempische steenweg", "Kempische Steenweg"), true);
    assert.equal(sameName("Sint-Truiden", "Sint Truiden"), true);
    assert.equal(sameName("Liège", "Liege"), true);
    assert.equal(sameName("Hasselt", "Genk"), false);
  });
});
