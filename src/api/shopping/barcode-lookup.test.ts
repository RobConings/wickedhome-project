/**
 * Unit tests for barcode auto-fill: code normalisation, answer mapping, quantities, names, categories and
 * cache freshness. Hand-made sample answers only: no network or database. Run on the server:
 *
 *   npx tsx --test src/api/shopping/barcode-lookup.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandUpcE,
  hasValidCheckDigit,
  isInStoreCode,
  isLookupBarcode,
  normalizeBarcode,
} from "@/features/shopping/types/barcode-lookup";
import {
  HIT_TTL_MS,
  MISS_TTL_MS,
  askSources,
  composeProductName,
  isFreshLookup,
  mapCategory,
  packageSizeFromName,
  parsePackageQuantity,
  pickName,
  readSourceAnswer,
  sourceProductUrl,
  tidyBrand,
  toLookupRecord,
  toSuggestion,
  type SourceKind,
} from "./barcode-lookup";

// Sample answers, shaped like the v3 product API (trimmed to the fields we ask for).
const colaAnswer = {
  code: "5449000000996",
  errors: [],
  product: {
    brands: "COCA-COLA SERVICES SA/NV",
    categories_tags: ["en:beverages", "en:carbonated-drinks", "en:sodas", "en:colas"],
    code: "5449000000996",
    generic_name: "Bebida refrescante aromatizada",
    image_front_url: "https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.1129.400.jpg",
    lang: "es",
    product_name: "Coca-Cola Original",
    product_name_en: "Coca-Cola",
    product_name_fr: "Coca-Cola",
    product_quantity: 330,
    product_quantity_unit: "ml",
    product_type: "food",
    quantity: "330 ml",
  },
  result: { id: "product_found" },
  status: "success",
};
const otherTypeAnswer = {
  code: "5410091755317",
  errors: [{ field: { id: "product_type", value: "beauty" }, message: { id: "product_found_with_a_different_product_type" } }],
  result: { id: "product_found_with_a_different_product_type" },
  status: "failure",
};
const shampooAnswer = {
  code: "5410091755317",
  product: {
    brands: "syoss men",
    categories_tags: ["en:hair", "en:shampoos"],
    lang: "fr",
    product_name: "Syoss men power",
    product_quantity: "440",
    product_quantity_unit: "ml",
    product_type: "beauty",
    quantity: "440 ml",
    image_front_url: "https://images.openbeautyfacts.org/images/products/541/009/175/5317/front_fr.4.400.jpg",
  },
  result: { id: "product_found" },
  status: "success",
};
const notFoundAnswer = { code: "5400000000003", result: { id: "product_not_found" }, status: "failure", errors: [] };

describe("barcode codes", () => {
  it("checks GTIN check digits", () => {
    assert.equal(hasValidCheckDigit("5449000000996"), true);
    assert.equal(hasValidCheckDigit("3017620422003"), true);
    assert.equal(hasValidCheckDigit("96385074"), true);
    assert.equal(hasValidCheckDigit("5449000000997"), false);
    assert.equal(hasValidCheckDigit("12345"), false);
  });

  it("normalises EAN-13, EAN-8, UPC-A, UPC-E and GTIN-14", () => {
    assert.equal(normalizeBarcode("5449000000996"), "5449000000996");
    assert.equal(normalizeBarcode(" 5449 0000 00996 "), "5449000000996");
    assert.equal(normalizeBarcode("96385074"), "96385074");
    assert.equal(normalizeBarcode("036000291452"), "0036000291452");
    assert.equal(normalizeBarcode("05449000000996"), "5449000000996");
    // UPC-E that isn't also a valid EAN-8: expanded to UPC-A, then EAN-13.
    assert.equal(expandUpcE("04252614"), "042100005264");
    assert.equal(normalizeBarcode("04252614"), "0042100005264");
    // Valid as EAN-8 too: EAN-8 wins.
    assert.equal(expandUpcE("01234565"), "012345000065");
    assert.equal(normalizeBarcode("01234565"), "01234565");
  });

  it("rejects what isn't a product barcode", () => {
    assert.equal(normalizeBarcode("5449000000997"), null);
    assert.equal(normalizeBarcode("WH-P-7K2Q9X"), null);
    assert.equal(normalizeBarcode("1234567"), null);
    assert.equal(normalizeBarcode("15449000000993"), null);
  });

  it("never looks up in-store codes", () => {
    assert.equal(isInStoreCode("2123456789010"), true);
    assert.equal(isInStoreCode("0212345678903"), true);
    assert.equal(isLookupBarcode("2123456789010"), false);
    assert.equal(isLookupBarcode("5449000000996"), true);
    assert.equal(isLookupBarcode("5449000000997"), false);
  });
});

describe("package sizes from product names (the backfill)", () => {
  it("reads one package's content, multipacks multiplied out", () => {
    assert.deepEqual(packageSizeFromName("BONI franse emmental geraspt 200 g"), { amount: 200, unit: "g" });
    assert.deepEqual(packageSizeFromName("Coca-Cola Zero 6 x 33 cl"), { amount: 198, unit: "cl" });
    assert.deepEqual(packageSizeFromName("Halfvolle melk 1,5L"), { amount: 1.5, unit: "l" });
    assert.deepEqual(packageSizeFromName("Vaatwastabletten 30 stuks"), { amount: 30, unit: "pcs" });
  });

  it("leaves names without an amount and a known unit alone", () => {
    assert.equal(packageSizeFromName("Bloem"), null);
    assert.equal(packageSizeFromName("Spek 2 sneetjes"), null);
    assert.equal(packageSizeFromName("Tacker / nietpistool"), null);
  });
});

describe("package quantities", () => {
  it("reads Belgian and international formats", () => {
    assert.deepEqual(parsePackageQuantity("1,5 l", "nl"), { text: "1,5 l", amount: 1.5, unit: "l", count: 1 });
    // Formatted like the rest of the app (nl-BE / en-BE: decimal comma in both languages).
    assert.deepEqual(parsePackageQuantity("1,5 l", "en"), { text: "1,5 l", amount: 1.5, unit: "l", count: 1 });
    assert.deepEqual(parsePackageQuantity("1.5L", "nl"), { text: "1,5 l", amount: 1.5, unit: "l", count: 1 });
    assert.deepEqual(parsePackageQuantity("1 L", "en"), { text: "1 l", amount: 1, unit: "l", count: 1 });
    assert.deepEqual(parsePackageQuantity("500 g", "nl"), { text: "500 g", amount: 500, unit: "g", count: 1 });
    assert.deepEqual(parsePackageQuantity("2,5 kg", "nl"), { text: "2,5 kg", amount: 2.5, unit: "kg", count: 1 });
    assert.deepEqual(parsePackageQuantity("2 dl", "nl"), { text: "20 cl", amount: 20, unit: "cl", count: 1 });
    assert.deepEqual(parsePackageQuantity("12 stuks", "nl"), { text: "12 pcs", amount: 12, unit: "pcs", count: 1 });
  });

  it("reads multipacks", () => {
    const sixPack = { text: "6 x 33 cl", amount: 33, unit: "cl", count: 6 };
    assert.deepEqual(parsePackageQuantity("6 x 33 cl", "nl"), sixPack);
    assert.deepEqual(parsePackageQuantity("6x33cl", "nl"), sixPack);
    assert.deepEqual(parsePackageQuantity("6 × 33 cl", "nl"), sixPack);
    assert.deepEqual(parsePackageQuantity("33 cl x 6", "nl"), sixPack);
    assert.deepEqual(parsePackageQuantity("4 x 1.5 l", "en"), { text: "4 x 1,5 l", amount: 1.5, unit: "l", count: 4 });
  });

  it("skips units it doesn't know and extra text", () => {
    assert.deepEqual(parsePackageQuantity("40g (20 boulettes / pellets)", "nl"), { text: "40 g", amount: 40, unit: "g", count: 1 });
    assert.deepEqual(parsePackageQuantity("Net wt 16 oz (454 g)", "en"), { text: "454 g", amount: 454, unit: "g", count: 1 });
  });

  it("falls back to the separate fields, then to the text as it is", () => {
    assert.deepEqual(parsePackageQuantity(null, "nl", { amount: 330, unit: "ml" }), { text: "330 ml", amount: 330, unit: "ml", count: 1 });
    assert.deepEqual(parsePackageQuantity("un paquet", "nl"), { text: "un paquet", amount: null, unit: null, count: 1 });
    assert.equal(parsePackageQuantity(null, "nl"), null);
    assert.equal(parsePackageQuantity("  ", "nl"), null);
  });
});

describe("names and brands", () => {
  const names = { nl: "Halfvolle melk", fr: "Lait demi-écrémé", en: "Semi-skimmed milk", default: "Lait" };

  it("prefers the user's language, then nl, fr, en, then the main name", () => {
    assert.equal(pickName(names, "nl"), "Halfvolle melk");
    assert.equal(pickName(names, "en"), "Semi-skimmed milk");
    assert.equal(pickName({ fr: "Lait", en: "Milk" }, "nl"), "Lait");
    assert.equal(pickName({ fr: "Lait", nl: "Melk" }, "en"), "Melk");
    assert.equal(pickName({ en: "Milk", default: "Leche" }, "nl"), "Milk");
    assert.equal(pickName({ default: "Leche" }, "nl"), "Leche");
    assert.equal(pickName({}, "nl"), null);
  });

  it("fills the main language from the main name", () => {
    const record = toLookupRecord({ lang: "nl", product_name: "Choco", product_name_fr: "Choco pâte" }, "food");
    assert.equal(record.names.nl, "Choco");
    assert.equal(pickName(record.names, "en"), "Choco");
  });

  it("tidies brands", () => {
    assert.equal(tidyBrand("COCA-COLA SERVICES SA/NV"), "Coca-Cola Services");
    assert.equal(tidyBrand("Nutella, Ferrero"), "Nutella");
    assert.equal(tidyBrand("syoss men"), "Syoss Men");
    assert.equal(tidyBrand("head & shoulders"), "Head & Shoulders");
    assert.equal(tidyBrand("Melitta Europa GmbH & Co.KG"), "Melitta Europa");
    assert.equal(tidyBrand("LU"), "LU");
    assert.equal(tidyBrand(null), null);
  });

  it("composes the product name with brand and size when they are missing", () => {
    const size = { text: "1,5 l", amount: 1.5, unit: "l", count: 1 };
    assert.equal(composeProductName("Original Taste", "Coca-Cola", size), "Coca-Cola Original Taste 1,5 l");
    assert.equal(composeProductName("Coca-Cola Zero", "Coca-Cola Services", size), "Coca-Cola Zero 1,5 l");
    assert.equal(composeProductName("Coca-Cola 1,5L", "Coca-Cola", size), "Coca-Cola 1,5L");
    assert.equal(composeProductName("Produit vaisselle", null, null), "Produit vaisselle");
  });
});

describe("categories", () => {
  it("maps food categories onto the app's own", () => {
    assert.equal(mapCategory(["en:beverages", "en:sodas", "en:colas"], "food"), "drinks");
    assert.equal(mapCategory(["en:dairies", "en:milks", "en:beverages"], "food"), "dairy");
    assert.equal(mapCategory(["en:frozen-foods", "en:pizzas", "en:meals"], "food"), "frozen");
    assert.equal(mapCategory(["en:breakfasts", "en:spreads", "en:sweet-spreads", "en:hazelnut-spreads"], "food"), "pantry");
    assert.equal(mapCategory(["en:beverages", "en:hot-beverages", "en:coffees"], "food"), "pantry");
    assert.equal(mapCategory(["en:meats", "en:prepared-meats", "en:hams"], "food"), "meat_fish");
    assert.equal(mapCategory(["en:breads"], "food"), "bakery");
    assert.equal(mapCategory(["en:something-new"], "food"), null);
    assert.equal(mapCategory([], "food"), null);
  });

  it("uses the product type for other products", () => {
    assert.equal(mapCategory(["en:hair", "en:shampoos"], "beauty"), "personal_care");
    assert.equal(mapCategory(["en:droog hondenvoer"], "petfood"), "pets");
    assert.equal(mapCategory(["en:dishwashing-liquids"], "product"), "household");
    assert.equal(mapCategory(["en:pens"], "product"), null);
  });
});

describe("cache freshness", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms);
  const day = 24 * 60 * 60 * 1000;

  it("reuses hits for 90 days and misses for 7", () => {
    assert.equal(HIT_TTL_MS, 90 * day);
    assert.equal(MISS_TTL_MS, 7 * day);
    assert.equal(isFreshLookup({ found: true, fetchedAt: ago(89 * day) }, now), true);
    assert.equal(isFreshLookup({ found: true, fetchedAt: ago(91 * day) }, now), false);
    assert.equal(isFreshLookup({ found: false, fetchedAt: ago(6 * day) }, now), true);
    assert.equal(isFreshLookup({ found: false, fetchedAt: ago(8 * day) }, now), false);
  });
});

describe("source answers", () => {
  it("reads found, other type and not found", () => {
    assert.equal(readSourceAnswer(colaAnswer, "food").kind, "found");
    assert.deepEqual(readSourceAnswer(otherTypeAnswer, "food"), { kind: "other_type", productType: "beauty" });
    assert.deepEqual(readSourceAnswer(notFoundAnswer, "food"), { kind: "not_found" });
    assert.throws(() => readSourceAnswer("<html>busy</html>", "food"));
    assert.throws(() => readSourceAnswer({ hello: "world" }, "food"));
  });

  it("asks the food site first and follows the product type once", async () => {
    const asked: string[] = [];
    const answers: Record<SourceKind, unknown> = { food: otherTypeAnswer, beauty: shampooAnswer, petfood: notFoundAnswer, product: notFoundAnswer };
    const found = await askSources("5410091755317", async (kind, url) => {
      asked.push(url);
      return answers[kind];
    });
    assert.equal(found?.productType, "beauty");
    assert.deepEqual(asked, [sourceProductUrl("food", "5410091755317"), sourceProductUrl("beauty", "5410091755317")]);
    assert.match(asked[0] ?? "", /^https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\/5410091755317\?fields=/);
  });

  it("stops after one read for an unknown code", async () => {
    let reads = 0;
    const found = await askSources("5400000000003", async () => {
      reads += 1;
      return notFoundAnswer;
    });
    assert.equal(found, null);
    assert.equal(reads, 1);
  });
});

describe("mapping to a suggestion", () => {
  it("maps a food answer for a Dutch-speaking user", () => {
    const record = toLookupRecord(colaAnswer.product, "food");
    const suggestion = toSuggestion("5449000000996", record, "nl", true);
    assert.deepEqual(suggestion, {
      code: "5449000000996",
      name: "Coca-Cola",
      brand: "Coca-Cola Services",
      genericName: "Bebida refrescante aromatizada",
      quantity: { text: "330 ml", amount: 330, unit: "ml", count: 1 },
      category: "drinks",
      imageUrl: "/api/shopping/barcode/5449000000996/image",
      productName: "Coca-Cola 330 ml",
    });
  });

  it("maps a beauty answer without a photo", () => {
    const record = toLookupRecord(shampooAnswer.product, "beauty");
    const suggestion = toSuggestion("5410091755317", record, "en", false);
    assert.equal(suggestion?.name, "Syoss men power");
    assert.equal(suggestion?.brand, "Syoss Men");
    assert.equal(suggestion?.category, "personal_care");
    assert.equal(suggestion?.imageUrl, null);
    assert.equal(suggestion?.productName, "Syoss men power 440 ml");
  });

  it("keeps only photos on the sources' own image hosts", () => {
    const record = toLookupRecord({ product_name: "X", image_front_url: "https://evil.example/x.jpg", image_url: "http://images.openfoodfacts.org/x.jpg" }, "food");
    assert.equal(record.imageSourceUrl, null);
    assert.equal(toLookupRecord(colaAnswer.product, "food").imageSourceUrl, colaAnswer.product.image_front_url);
  });

  it("never sends where the data came from", () => {
    const suggestion = toSuggestion("5449000000996", toLookupRecord(colaAnswer.product, "food"), "en", true);
    assert.doesNotMatch(JSON.stringify(suggestion), /facts|openfood|images\./i);
  });
});
