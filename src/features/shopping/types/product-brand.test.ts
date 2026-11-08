import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productInputSchema } from "./shopping";

const base = { name: "Halfvolle melk", unit: "bottle", category: "dairy" };

describe("product brand input", () => {
  it("preserves compatibility with products created before a separate brand field existed", () => {
    const parsed = productInputSchema.parse(base);
    assert.equal(parsed.brand, undefined);
  });

  it("retains explicit brands and trims whitespace", () => {
    const parsed = productInputSchema.parse({ ...base, brand: "  Boni  " });
    assert.equal(parsed.brand, "Boni");
  });

  it("treats an intentionally cleared brand as unknown", () => {
    assert.equal(productInputSchema.parse({ ...base, brand: "" }).brand, null);
    assert.equal(productInputSchema.parse({ ...base, brand: "   " }).brand, null);
    assert.equal(productInputSchema.parse({ ...base, brand: null }).brand, null);
  });

  it("rejects brands longer than the form and API limit", () => {
    assert.equal(productInputSchema.safeParse({ ...base, brand: "a".repeat(81) }).success, false);
    assert.equal(productInputSchema.safeParse({ ...base, brand: "a".repeat(80) }).success, true);
  });
});
