import assert from "node:assert/strict";
import { it } from "node:test";
import { collectAndGoMatches } from "./collect-and-go-matches";
import type { CollectAndGoCart } from "./collect-and-go";
import type { Product, ShoppingItem } from "./shopping";
const now = Date.parse("2026-11-13T07:00:00Z");
const item = (name: string, extra: Partial<ShoppingItem> = {}) => ({ id: "need", name, status: "open", productId: null, ...extra }) as ShoppingItem;
const cart = (names: string[]): CollectAndGoCart => ({ authenticated: true, observedAt: new Date(now).toISOString(), truncated: false, items: names.map(name => ({ name, quantity: 2, unitPriceCents: 162, url: null })) });
it("matches an unambiguous complete name without fuzzy word, package or quantity substitutions", () => {
  assert.deepEqual([...collectAndGoMatches([item(" BONI Melk 1 l ")], [], cart(["BONI  MELK 1 l"]), true, now)], ["need"]);
  for (const names of [["BONI Melk 2 l"], ["Melk"], ["BONI Melk 1 l", "BONI Melk 1 l"]]) assert.equal(collectAndGoMatches([item("BONI Melk 1 l")], [], cart(names), true, now).size, 0);
  assert.equal(collectAndGoMatches([item("BONI Melk 1 l", { status: "bought" })], [], cart(["BONI Melk 1 l"]), true, now).size, 0);
});
it("uses a recorded CollectAndGo article link, without assuming in-store article identifiers match online", () => {
  const snapshot = cart(["A retailer-specific name"]); snapshot.items[0]!.articleNumber = "123";
  const product = { id: "p", name: "Our own name", shopLinks: [{ articleNumber: "123", url: "https://www.collectandgo.be/nl/assortiment/example" }] } as Product;
  assert.equal(collectAndGoMatches([item("Our name", { productId: "p" })], [product], snapshot, true, now).size, 1);
  product.shopLinks[0]!.url = "https://www.colruyt.be/nl/producten/example";
  assert.equal(collectAndGoMatches([item("Our name", { productId: "p" })], [product], snapshot, true, now).size, 0);
});
it("removes presence labels for failed/revoked reads, stale snapshots and invalid observation times", () => {
  const snapshot = cart(["Milk"]);
  assert.equal(collectAndGoMatches([item("Milk")], [], snapshot, false, now).size, 0);
  assert.equal(collectAndGoMatches([item("Milk")], [], snapshot, true, now + 90001).size, 0);
  for (const observedAt of ["invalid", new Date(now + 10000).toISOString()]) assert.equal(collectAndGoMatches([item("Milk")], [], { ...snapshot, observedAt }, true, now).size, 0);
  assert.equal(collectAndGoMatches([item("Milk")], [], cart([]), true, now).size, 0);
});
