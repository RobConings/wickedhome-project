/**
 * Unit tests for the quick-action list: who sees which action, unique shortcuts, and every label in both
 * languages. Run on the server:
 *
 *   npx tsx --test src/app/quick-actions.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ListPlusIcon } from "lucide-react";
import { QUICK_ACTIONS, quickActionsFor, toQuickActionItems, type QuickActionDefinition } from "./quick-actions";

const ids = (actions: QuickActionDefinition[]) => actions.map((action) => action.id);

describe("quickActionsFor", () => {
  it("gives owners and adults every action, in the list's order", () => {
    assert.deepEqual(ids(quickActionsFor("owner")), ids([...QUICK_ACTIONS]));
    assert.deepEqual(ids(quickActionsFor("adult")), ids([...QUICK_ACTIONS]));
  });

  it("gives children only what they can do: the shopping list and the assistant", () => {
    assert.deepEqual(ids(quickActionsFor("child")), ["shoppingItem", "assistant"]);
  });

  it("never shows children a finance action", () => {
    assert.equal(quickActionsFor("child").some((action) => action.accent === "finance"), false);
  });

  it("filters a custom list too", () => {
    const base = { labelKey: "quickActions.items.task", icon: ListPlusIcon, accent: "tasks", to: "/", key: "X" } as const;
    const list: QuickActionDefinition[] = [
      { ...base, id: "everyone" },
      { ...base, id: "ownerOnly", roles: ["owner"] },
    ];
    assert.deepEqual(ids(quickActionsFor("adult", list)), ["everyone"]);
    assert.deepEqual(ids(quickActionsFor("owner", list)), ["everyone", "ownerOnly"]);
  });
});

describe("QUICK_ACTIONS", () => {
  it("has unique ids and unique shortcut letters", () => {
    assert.equal(new Set(QUICK_ACTIONS.map((action) => action.id)).size, QUICK_ACTIONS.length);
    assert.equal(new Set(QUICK_ACTIONS.map((action) => action.key.toLowerCase())).size, QUICK_ACTIONS.length);
    for (const action of QUICK_ACTIONS) assert.match(action.key, /^[A-Z]$/, action.id);
  });

  it("opens the fast expense log, not the full form", () => {
    assert.equal(QUICK_ACTIONS.find((action) => action.id === "logExpense")?.to, "/expenses?log=1");
  });

  it("opens the new-recipe form on the All recipes tab, for adults only", () => {
    const recipe = QUICK_ACTIONS.find((action) => action.id === "recipe");
    assert.equal(recipe?.to, "/recipes?tab=all&new=1");
    assert.deepEqual(recipe?.roles, ["owner", "adult"]);
  });

  for (const locale of ["en", "nl"]) {
    it(`has every label in ${locale}`, () => {
      const messages = JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8"));
      for (const action of QUICK_ACTIONS) {
        const value = action.labelKey.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
        assert.equal(typeof value, "string", `${locale}: ${action.labelKey}`);
      }
    });
  }
});

describe("toQuickActionItems", () => {
  it("translates, adds the N shortcut and the frame's handlers", () => {
    const open = () => {};
    const items = toQuickActionItems(quickActionsFor("child"), (key) => `t:${key}`, { assistant: open });
    assert.deepEqual(
      items.map(({ id, label, shortcut, onSelect }) => ({ id, label, shortcut, onSelect })),
      [
        { id: "shoppingItem", label: "t:quickActions.items.shoppingItem", shortcut: ["N", "S"], onSelect: undefined },
        { id: "assistant", label: "t:quickActions.items.assistant", shortcut: ["N", "A"], onSelect: open },
      ],
    );
  });
});
