/**
 * The shopping, shops and inventory skills: the per-shop summary, picking a stock item, roles, and that no
 * text the person sees names where barcode data comes from. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/shopping/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listAssistantSkills } from "@ai/core/skills";
import { listAssistantTools, toolInputJsonSchema } from "@ai/core/tools";
import "@ai/skills";
import { pickStockItem } from "../inventory/tools";
import { shopSummary } from "./tools";

const shop = (id: string, name: string) => ({ shopId: id, shop: { id, name, type: "supermarket" as const, iconUrl: null } });
const noShop = { shopId: null, shop: null };

describe("shopping, shops and inventory skills", () => {
  it("summarises open items per shop, most first, no shop last", () => {
    assert.equal(shopSummary([]), null);
    assert.equal(shopSummary([noShop, shop("a", "Aldi"), shop("c", "Colruyt"), shop("c", "Colruyt")]), "Colruyt 2 · Aldi 1 · no shop 1");
  });

  it("picks the stock item of a product, or asks where", () => {
    const items = [
      { placeId: "p1", placeName: "Keuken" },
      { placeId: "p2", placeName: "Kelder" },
    ];
    assert.deepEqual(pickStockItem([items[0]!], "Rijst"), items[0]);
    assert.deepEqual(pickStockItem(items, "Rijst", { id: "p2", name: "Kelder" }), items[1]);
    assert.match(String(pickStockItem(items, "Rijst")), /Keuken or Kelder/);
    assert.match(String(pickStockItem(items, "Rijst", { id: "p9", name: "Garage" })), /isn't kept in Garage/);
    assert.match(String(pickStockItem([], "Rijst")), /isn't kept in stock/);
  });

  it("lets children add, tick off and remove their own items, use stock and star shops, but not manage", () => {
    const childTools = listAssistantTools()
      .filter((tool) => ["shopping", "shops", "inventory"].includes(tool.skill) && tool.permission !== "read" && tool.roles.includes("child"))
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(childTools, ["inventory.change_stock", "shopping.add_item", "shopping.remove", "shopping.update_item", "shops.favorite"]);
  });

  it("never names the external product database in anything the person or the model sees", () => {
    const source = /open\s*(food|beauty|petfood|products)\s*facts|openfoodfacts/i;
    for (const tool of listAssistantTools()) {
      const text = [tool.description, tool.activity.en, tool.activity.nl, JSON.stringify(toolInputJsonSchema(tool))].join(" ");
      assert.doesNotMatch(text, source, tool.name);
    }
    for (const skill of listAssistantSkills()) assert.doesNotMatch(`${skill.summary} ${skill.guide}`, source, skill.id);
  });
});
