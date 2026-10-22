import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ShoppingItem } from "../types/shopping";
import { NO_SHOP_VIEW_FILTERS, filterShopViewItems, groupShopViewItems, priorityTier } from "./shopping-grouping";

const item = (name: string, patch: Partial<ShoppingItem> = {}) =>
  ({
    id: name,
    name,
    listId: "weekly",
    listName: "Weekly",
    note: null,
    category: null,
    isEssential: null,
    stockStatus: null,
    priceCents: null,
    quantity: 1,
    alternatives: [],
    ...patch,
  }) as ShoppingItem;

describe("shop view priority", () => {
  it("puts stock below minimum first, then at minimum, essentials, others and extras", () => {
    assert.equal(priorityTier(item("a", { stockStatus: "below_minimum", isEssential: false })), "urgent");
    assert.equal(priorityTier(item("a", { stockStatus: "at_minimum" })), "warning");
    assert.equal(priorityTier(item("a", { isEssential: true, stockStatus: "above_minimum" })), "essential");
    assert.equal(priorityTier(item("a")), "normal");
    assert.equal(priorityTier(item("a", { isEssential: false })), "extra");
  });

  it("groups by tier and keeps essentials first within a tier", () => {
    const groups = groupShopViewItems(
      [
        item("Chips", { isEssential: false }),
        item("Zout", { stockStatus: "below_minimum", isEssential: false }),
        item("Melk", { stockStatus: "below_minimum", isEssential: true }),
        item("Brood", { isEssential: true }),
      ],
      "priority",
    );
    assert.deepEqual(
      groups.map((group) => [group.key, group.items.map((entry) => entry.name)]),
      [
        ["urgent", ["Melk", "Zout"]],
        ["essential", ["Brood"]],
        ["extra", ["Chips"]],
      ],
    );
  });

  it("sorts by line price with unpriced items last", () => {
    const [group] = groupShopViewItems(
      [item("Free"), item("Cheap", { priceCents: 100, quantity: 3 }), item("Dear", { priceCents: 250 })],
      "price",
    );
    assert.deepEqual(group?.items.map((entry) => entry.name), ["Cheap", "Dear", "Free"]);
  });
});

describe("shop view filters", () => {
  const items = [
    item("Melk", { category: "dairy", stockStatus: "at_minimum", isEssential: true }),
    item("Chips", { category: "pantry", isEssential: false, listId: "party", listName: "Feestje" }),
    item("Schroeven", { note: "4 x 40" }),
  ];
  const names = (filters: Partial<typeof NO_SHOP_VIEW_FILTERS>) =>
    filterShopViewItems(items, { ...NO_SHOP_VIEW_FILTERS, ...filters }).map((entry) => entry.name);

  it("searches name, note and list", () => {
    assert.deepEqual(names({ query: "melk" }), ["Melk"]);
    assert.deepEqual(names({ query: "40" }), ["Schroeven"]);
    assert.deepEqual(names({ query: "feest" }), ["Chips"]);
  });

  it("filters by category (uncategorised as other), list and priority", () => {
    assert.deepEqual(names({ category: "other" }), ["Schroeven"]);
    assert.deepEqual(names({ listId: "party" }), ["Chips"]);
    assert.deepEqual(names({ priority: "needed" }), ["Melk"]);
    assert.deepEqual(names({ priority: "extra" }), ["Chips"]);
  });
});
