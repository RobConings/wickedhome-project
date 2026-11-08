import assert from "node:assert/strict";
import { it } from "node:test";
import { messageInline } from "./message-inline";

it("assistant answers retain strong text and open exact record URLs and web sources", () => {
  const parts = messageInline("**Ready**: [product](/inventory/products/milk?workspace=overview#product-stock-history) and [source](https://example.test/item?q=milk).");
  assert.deepEqual(parts.filter((part) => part.kind !== "text"), [
    { kind: "strong", text: "Ready" },
    { kind: "link", text: "product", href: "/inventory/products/milk?workspace=overview#product-stock-history", external: false },
    { kind: "link", text: "source", href: "https://example.test/item?q=milk", external: true },
  ]);
  assert.deepEqual(messageInline("Still [loading](/inventory/products/"), [{ kind: "text", text: "Still [loading](/inventory/products/" }]);
});

it("model text cannot create executable, protocol-relative or credentialed navigation", () => {
  for (const url of ["javascript:alert", "data:text/html,hello", "//outside.test/x", "/\\outside.test/x", "https://user:secret@example.test/x"]) {
    const text = `[open](${url})`;
    assert.deepEqual(messageInline(text), [{ kind: "text", text }]);
  }
});
