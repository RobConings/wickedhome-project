import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listAssistantTools, toolInputJsonSchema } from "@ai/core/tools";
import "@ai/skills";

describe("inventory purchase tools", () => {
  it("exposes purchase history as a read and purchases with an optional receipt as a confirmed write", () => {
    const tools = listAssistantTools();
    const purchases = tools.find((tool) => tool.name === "inventory.purchases");
    const record = tools.find((tool) => tool.name === "inventory.record_purchase");

    assert.ok(purchases);
    assert.equal(purchases.permission, "read");
    assert.ok(record);
    assert.equal(record.permission, "write");
    assert.equal(record.confirm, "always");
    assert.deepEqual(Object.keys(toolInputJsonSchema(record).properties ?? {}).sort(), ["items", "note", "receiptImageIndex"]);
    assert.match(record.description, /with or without a receipt/);
    const parsed = record.input.safeParse({ items: [{ product: "Bananen", quantity: "1" }] });
    assert.equal(parsed.success, true, "quantities can use the existing/default household count unit");
    if (parsed.success) assert.deepEqual(parsed.data, { items: [{ product: "Bananen", quantity: 1 }] });
    const weight = record.input.safeParse({ items: [{ product: "Rundergehakt", quantity: 938, unit: "g" }] });
    assert.equal(weight.success, true, "weight remains available for products normally tracked by weight");
    const ctx = {
      user: {
        id: "u1",
        email: "u@example.com",
        name: "User",
        role: "adult" as const,
        locale: "nl" as const,
        householdId: "h1",
        householdName: "Home",
        habitantId: null,
      },
      householdId: "h1",
      locale: "nl" as const,
      signal: new AbortController().signal,
      channel: "chat" as const,
    };
    assert.equal(record.refuse?.(ctx, parsed.success ? parsed.data : { items: [] }), null, "manual purchases do not need an image");
    assert.equal(record.refuse?.({ ...ctx, receiptImageIds: ["image1"] }, parsed.success ? parsed.data : { items: [] }), null);
    assert.equal(record.refuse?.({ ...ctx, receiptImageIds: ["image1", "image2"] }, parsed.success ? parsed.data : { items: [] }), null, "a receipt link is optional when several images are attached");
    const selected = record.input.safeParse({ items: [{ product: "Bananen", quantity: 1 }], receiptImageIndex: 1 });
    assert.equal(selected.success, true);
    if (selected.success) assert.match(record.refuse?.({ ...ctx, receiptImageIds: ["image1"] }, selected.data) ?? "", /does not match/);
  });
});
