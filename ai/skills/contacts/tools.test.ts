/**
 * The contacts skill: who may do what (as the contacts page: everyone looks, owners and adults change; deleting
 * always asks), the `contact` resolver, and keyword routing in Dutch and English. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/contacts/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEntityResolver } from "@ai/core/resolve";
import { routeMessage } from "@ai/core/skills";
import { getAssistantTool, toolsFor } from "@ai/core/tools";
import "@ai/skills";
import "./tools";

const rules = (name: string) => {
  const tool = getAssistantTool(name);
  assert.ok(tool, `${name} is registered`);
  return [tool.permission, tool.confirm, [...tool.roles].sort().join(",")];
};

describe("contacts skill", () => {
  it("mirrors the contacts page's roles and always confirms changes", () => {
    assert.deepEqual(rules("contacts.find"), ["read", "never", "adult,child,owner"]);
    assert.deepEqual(rules("contacts.save"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("contacts.link"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("contacts.delete"), ["sensitive", "always", "adult,owner"]);
  });

  it("lets children look contacts up but not change them", () => {
    const child = toolsFor("child").map((tool) => tool.name);
    assert.ok(child.includes("contacts.find"));
    for (const name of ["contacts.save", "contacts.link", "contacts.delete"]) assert.ok(!child.includes(name), name);
  });

  it("previews a save as fields before the person confirms", () => {
    assert.equal(typeof getAssistantTool("contacts.save")?.preview, "function");
  });

  it("registers the contact resolver for names and mention routing", () => {
    const resolver = getEntityResolver("contact");
    assert.ok(resolver, "contact resolver");
    assert.equal(resolver.skill, "contacts");
    assert.equal(typeof resolver.list, "function");
    assert.equal(typeof resolver.search, "function");
  });

  it("routes everyday questions about contacts in Dutch and English", () => {
    const cases = [
      "Wat is het nummer van de loodgieter?",
      "Voeg de aannemer Bouwbedrijf Peeters toe aan mijn contacten",
      "Wie is onze elektricien?",
      "What's the plumber's phone number?",
      "Add a contact: the roofer",
      "Which contractor works on the bathroom?",
    ];
    for (const question of cases) {
      const matches = routeMessage(question).map((match) => match.id);
      assert.ok(matches.includes("contacts"), `"${question}" → contacts (got ${matches.join(", ") || "nothing"})`);
    }
  });
});
