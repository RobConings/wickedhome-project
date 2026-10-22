/**
 * Unit tests for the barcode cache cleanup policy: which rows are past keeping, which are kept because a
 * saved product shows their photo, and where their photos may be stored. No database or files. Run on the
 * server:
 *
 *   npx tsx --test src/api/shopping/barcode-cache.test.ts
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { barcodeImagePath } from "@/features/shopping/types/barcode-lookup";
import {
  HIT_KEEP_MS,
  MISS_KEEP_MS,
  codeFromBarcodeImageUrl,
  expiryCutoffs,
  isExpiredLookup,
  productImageFiles,
  selectExpiredLookups,
  type CachedLookup,
} from "./barcode-cache";
import { HIT_TTL_MS, MISS_TTL_MS } from "./barcode-lookup";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-03T04:35:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
const row = (code: string, found: boolean, days: number): CachedLookup => ({ code, found, fetchedAt: daysAgo(days) });

describe("keep periods", () => {
  it("keeps rows well past their reuse period", () => {
    assert.equal(HIT_KEEP_MS, 180 * DAY_MS);
    assert.equal(MISS_KEEP_MS, 30 * DAY_MS);
    assert.ok(HIT_KEEP_MS > HIT_TTL_MS);
    assert.ok(MISS_KEEP_MS > MISS_TTL_MS);
  });

  it("computes the cutoffs from now", () => {
    assert.deepEqual(expiryCutoffs(now), { hit: daysAgo(180), miss: daysAgo(30) });
  });
});

describe("isExpiredLookup", () => {
  it("expires hits after 180 days, not before", () => {
    assert.equal(isExpiredLookup(row("5449000000996", true, 90), now), false);
    assert.equal(isExpiredLookup(row("5449000000996", true, 179), now), false);
    assert.equal(isExpiredLookup(row("5449000000996", true, 180), now), false);
    assert.equal(isExpiredLookup(row("5449000000996", true, 181), now), true);
  });

  it("expires misses after 30 days, not before", () => {
    assert.equal(isExpiredLookup(row("5449000000996", false, 7), now), false);
    assert.equal(isExpiredLookup(row("5449000000996", false, 30), now), false);
    assert.equal(isExpiredLookup(row("5449000000996", false, 31), now), true);
  });
});

describe("selectExpiredLookups", () => {
  const rows = [
    row("5449000000996", true, 200), // old hit → delete
    row("8710398500021", true, 100), // hit, not old enough → keep
    row("4006381333931", false, 45), // old miss → delete
    row("96385074", false, 10), // recent miss → keep
    row("5410013108009", true, 400), // old hit, photo used by a product → keep
  ];

  it("selects expired rows whose photo nothing uses", () => {
    assert.deepEqual(selectExpiredLookups(rows, new Set(["5410013108009"]), now), ["5449000000996", "4006381333931"]);
  });

  it("keeps referenced rows however old, and selects nothing from an empty cache", () => {
    assert.deepEqual(selectExpiredLookups(rows, new Set(["5449000000996", "4006381333931", "5410013108009"]), now), []);
    assert.deepEqual(selectExpiredLookups([], new Set(), now), []);
  });
});

describe("codeFromBarcodeImageUrl", () => {
  it("reads the code from the app's own photo path", () => {
    assert.equal(codeFromBarcodeImageUrl(barcodeImagePath("5449000000996")), "5449000000996");
    assert.equal(codeFromBarcodeImageUrl("/api/shopping/barcode/96385074/image?v=1"), "96385074");
  });

  it("ignores other URLs", () => {
    for (const url of [
      null,
      undefined,
      "",
      "https://example.com/api/shopping/barcode/5449000000996/image",
      "/api/shopping/barcode/5449000000996",
      "/api/shopping/barcode/../../etc/image",
      "/api/shops/abc/icon?v=1",
    ]) {
      assert.equal(codeFromBarcodeImageUrl(url), null, String(url));
    }
  });
});

describe("productImageFiles", () => {
  const dir = path.resolve("/srv/files/product-images");

  it("lists every possible photo file of a code inside the directory", () => {
    const files = productImageFiles(dir, "5449000000996");
    assert.deepEqual(
      files.map((file) => path.basename(file)).sort(),
      ["5449000000996.gif", "5449000000996.img", "5449000000996.jpg", "5449000000996.png", "5449000000996.webp"],
    );
    for (const file of files) assert.equal(path.dirname(file), dir);
  });

  it("resolves a relative directory and never leaves it", () => {
    const files = productImageFiles("data/files/../files/product-images", "96385074");
    assert.ok(files.length > 0);
    for (const file of files) assert.equal(path.dirname(file), path.resolve("data/files/product-images"));
  });

  it("returns nothing for anything that isn't a plain code", () => {
    for (const code of ["", "../5449000000996", "5449000000996/../../x", "..", "abc", "5449000000996.jpg", "/etc/passwd", "1234"]) {
      assert.deepEqual(productImageFiles(dir, code), [], code);
    }
  });
});
