/**
 * Unit tests for GeneralList's pure helpers: search matching (accents, case, several words), the remembered
 * list/tiles view and grouping. Run on the server:
 *
 *   npx tsx --test src/components/shared/general-list-helpers.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterBySearch,
  groupListItems,
  listViewStorageKey,
  matchesSearch,
  normalizeSearchText,
  parseListView,
  readStoredListView,
  resolveListView,
  storeListView,
} from "./general-list-helpers";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe("normalizeSearchText", () => {
  it("drops accents, lowercases and collapses spaces", () => {
    assert.equal(normalizeSearchText("  Krëfel   Élysée "), "krefel elysee");
    assert.equal(normalizeSearchText("ÇA VA"), "ca va");
  });
});

describe("matchesSearch", () => {
  it("matches regardless of accents and case, both ways", () => {
    assert.equal(matchesSearch(["Café Noir"], "cafe"), true);
    assert.equal(matchesSearch(["Cafe Noir"], "CAFÉ"), true);
    assert.equal(matchesSearch(["é"], "e"), true);
    assert.equal(matchesSearch(["e"], "é"), true);
  });

  it("an empty or blank query matches everything", () => {
    assert.equal(matchesSearch(["Anything"], ""), true);
    assert.equal(matchesSearch([], "   "), true);
  });

  it("every word must be found, in any of the texts", () => {
    assert.equal(matchesSearch(["Lena", "Child"], "lena child"), true);
    assert.equal(matchesSearch(["Lena", "Child"], "lena pet"), false);
  });

  it("ignores empty values and accepts numbers", () => {
    assert.equal(matchesSearch([null, undefined, "", 5410], "541"), true);
    assert.equal(matchesSearch([null, undefined], "x"), false);
  });
});

describe("filterBySearch", () => {
  const shops = [{ name: "Krëfel" }, { name: "Colruyt" }, { name: "Delhaize" }];

  it("filters on the texts of each item", () => {
    assert.deepEqual(filterBySearch(shops, "krefel", (shop) => [shop.name]), [{ name: "Krëfel" }]);
  });

  it("returns a copy of all items for an empty query", () => {
    const result = filterBySearch(shops, " ", (shop) => [shop.name]);
    assert.deepEqual(result, shops);
    assert.notEqual(result, shops);
  });
});

describe("parseListView", () => {
  it("accepts the two views, case and spaces ignored", () => {
    assert.equal(parseListView("list"), "list");
    assert.equal(parseListView(" Tiles "), "tiles");
  });

  it("rejects anything else", () => {
    for (const value of ["grid", "", null, undefined, 1, {}]) assert.equal(parseListView(value), null);
  });
});

describe("resolveListView", () => {
  it("prefers the URL, then the stored view, then the default", () => {
    assert.equal(resolveListView({ urlValue: "tiles", storedValue: "list", defaultView: "list" }), "tiles");
    assert.equal(resolveListView({ urlValue: "bogus", storedValue: "tiles", defaultView: "list" }), "tiles");
    assert.equal(resolveListView({ urlValue: null, storedValue: null, defaultView: "tiles" }), "tiles");
  });
});

describe("stored view", () => {
  it("round-trips through storage under a per-list key", () => {
    const storage = memoryStorage();
    storeListView("shops", "tiles", storage);
    assert.equal(storage.values.get(listViewStorageKey("shops")), "tiles");
    assert.equal(readStoredListView("shops", storage), "tiles");
    assert.equal(readStoredListView("habitants", storage), null);
  });

  it("survives storage that throws or is missing", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    assert.equal(readStoredListView("shops", broken), null);
    assert.doesNotThrow(() => storeListView("shops", "list", broken));
    assert.equal(readStoredListView("shops", undefined), null);
  });

  it("ignores a stored value that isn't a view", () => {
    const storage = memoryStorage();
    storage.setItem(listViewStorageKey("shops"), "grid");
    assert.equal(readStoredListView("shops", storage), null);
  });
});

describe("groupListItems", () => {
  const items = [
    { id: "a", type: "diy" },
    { id: "b", type: "supermarket" },
    { id: "c", type: "pets" },
    { id: "d", type: "supermarket" },
  ];

  it("follows the given order, unknown keys after, empty groups left out", () => {
    const groups = groupListItems(items, (item) => item.type, ["supermarket", "garden", "diy"]);
    assert.deepEqual(
      groups.map((group) => [group.key, group.items.map((item) => item.id)]),
      [
        ["supermarket", ["b", "d"]],
        ["diy", ["a"]],
        ["pets", ["c"]],
      ],
    );
  });

  it("puts an item in every group it names", () => {
    const groups = groupListItems(items, (item) => (item.id === "a" ? ["favorites", item.type] : item.type), ["favorites"]);
    assert.deepEqual(groups[0], { key: "favorites", items: [items[0]] });
    assert.ok(groups.find((group) => group.key === "diy")?.items.includes(items[0]!));
  });
});
