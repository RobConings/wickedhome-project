/**
 * The assistant's tool registry: zod → JSON Schema, the safety rules (read never asks, sensitive always asks,
 * disarming is never a tool), role filtering, and the real seed tools of every feature. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/tools.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { z } from "zod";
import {
  allowsRemember,
  fromWireName,
  listAssistantTools,
  needsConfirmation,
  registerAssistantTool,
  toOpenAiTools,
  toWireName,
  toolInputJsonSchema,
  toolsFor,
  unregisterAssistantTool,
  type AssistantToolDefinition,
} from "./tools";
// Every skill's real tools (registered on import, as src/api/app.ts does) and the core tools.
import "../skills";
import "./core-tools";
import { listAssistantSkills, routeMessage } from "./skills";
import { estimateTokens } from "./tokens";

const base = (overrides: Partial<AssistantToolDefinition>): AssistantToolDefinition => ({
  name: "test.thing",
  description: "A test tool.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Tested", nl: "Getest" },
  run: () => null,
  ...overrides,
});

const registered: string[] = [];
const register = (definition: AssistantToolDefinition) => {
  registered.push(definition.name);
  return registerAssistantTool(definition);
};
after(() => registered.forEach((name) => unregisterAssistantTool(name)));

describe("zod → JSON Schema", () => {
  it("describes an object with properties, required fields, enums and descriptions", () => {
    const schema = toolInputJsonSchema({
      input: z.object({
        name: z.string().min(1).max(80).describe("What to buy"),
        quantity: z.number().int().min(1).optional(),
        kind: z.enum(["a", "b"]).default("a"),
      }),
    });
    assert.equal(schema.type, "object");
    assert.equal(schema.$schema, undefined);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    assert.equal(properties.name?.type, "string");
    assert.equal(properties.name?.description, "What to buy");
    assert.equal(properties.quantity?.type, "integer");
    assert.deepEqual(properties.kind?.enum, ["a", "b"]);
    // A default makes a field optional for the model (input side).
    assert.deepEqual(schema.required, ["name"]);
  });

  it("gives an empty object for tools without arguments", () => {
    const schema = toolInputJsonSchema({ input: z.object({}) });
    assert.equal(schema.type, "object");
    assert.deepEqual(schema.properties, {});
  });

  it("builds OpenAI function tools with wire names", () => {
    const tool = register(base({ name: "test.wire_name" }));
    const [openAi] = toOpenAiTools([tool]);
    assert.equal(openAi?.type, "function");
    assert.equal(openAi?.function.name, "test_wire_name");
    assert.equal(fromWireName("test_wire_name"), "test.wire_name");
    assert.equal(toWireName("shopping.add_item"), "shopping_add_item");
    assert.match(openAi?.function.name ?? "", /^[a-zA-Z0-9_-]{1,64}$/);
  });
});

describe("registration rules", () => {
  it("refuses malformed names", () => {
    assert.throws(() => register(base({ name: "Thing" })), /must look like/);
    assert.throws(() => register(base({ name: "test_thing" })), /must look like/);
  });

  it("refuses a read tool that asks, a write that doesn't, a sensitive tool that only asks once", () => {
    assert.throws(() => register(base({ name: "test.read_asks", confirm: "always" })), /read tools never ask/);
    assert.throws(() => register(base({ name: "test.write_silent", permission: "write", confirm: "never" })), /must ask/);
    assert.throws(() => register(base({ name: "test.sensitive_once", permission: "sensitive", confirm: "first-time" })), /always ask/);
  });

  it("never registers disarming or unlocking, by name or by argument values", () => {
    assert.throws(() => register(base({ name: "alarm.disarm", permission: "sensitive", confirm: "always" })), /never exposed/);
    assert.throws(() => register(base({ name: "door.unlock", permission: "sensitive", confirm: "always" })), /never exposed/);
    assert.throws(
      () =>
        register(
          base({ name: "alarm.set_mode", permission: "sensitive", confirm: "always", input: z.object({ mode: z.enum(["armed_away", "disarmed"]) }) }),
        ),
      /never exposed/,
    );
  });

  it("makes alarm actions sensitive", () => {
    assert.throws(() => register(base({ name: "alarm.arm_home", permission: "write", confirm: "always" })), /alarm actions are sensitive/);
    const arm = register(base({ name: "alarm.arm_home", permission: "sensitive", confirm: "always" }));
    assert.equal(needsConfirmation(arm, true), true, "a remembered skip never applies to sensitive tools");
    assert.equal(allowsRemember(arm), false);
  });
});

describe("confirmation and roles", () => {
  it("asks first-time tools until the person ticks 'don't ask again'", () => {
    const tool = register(base({ name: "test.harmless", permission: "write", confirm: "first-time" }));
    assert.equal(needsConfirmation(tool, false), true);
    assert.equal(needsConfirmation(tool, true), false);
    assert.equal(allowsRemember(tool), true);
  });

  it("gives writes to owners and adults by default; reads to everyone", () => {
    register(base({ name: "test.read_all" }));
    register(base({ name: "test.write_managers", permission: "write", confirm: "always" }));
    register(base({ name: "test.write_children", permission: "write", confirm: "first-time", roles: ["owner", "adult", "child"] }));
    const child = toolsFor("child").map((tool) => tool.name);
    assert.ok(child.includes("test.read_all"));
    assert.ok(child.includes("test.write_children"));
    assert.ok(!child.includes("test.write_managers"));
    assert.ok(toolsFor("adult").some((tool) => tool.name === "test.write_managers"));
    assert.ok(toolsFor("owner", { readOnly: true }).every((tool) => tool.permission === "read"));
  });
});

describe("the features' tools", () => {
  const tools = () => listAssistantTools().filter((tool) => !tool.name.startsWith("test.") && !registered.includes(tool.name));

  it("registers the seed set", () => {
    const names = tools().map((tool) => tool.name);
    for (const name of [
      "calendar.agenda",
      "calendar.add_event",
      "tasks.list_open",
      "tasks.add",
      "tasks.complete",
      "shopping.list",
      "shopping.add_item",
      "expenses.due",
      "expenses.log",
      "income.to_enter",
      "income.record_variable",
      "energy.summary",
      "waste.next_collection",
      "weather.forecast",
      "inventory.low_stock",
    ]) {
      assert.ok(names.includes(name), `${name} is registered`);
    }
  });

  it("has no disarm (or unlock) tool, and every change asks", () => {
    for (const tool of listAssistantTools()) {
      assert.doesNotMatch(tool.name, /disarm|unlock/i);
      assert.doesNotMatch(JSON.stringify(toolInputJsonSchema(tool)), /disarm/i);
      if (tool.permission !== "read") assert.notEqual(tool.confirm, "never", `${tool.name} asks`);
    }
  });

  it("logs expenses only after an explicit confirmation every time", () => {
    const log = tools().find((tool) => tool.name === "expenses.log");
    assert.equal(log?.permission, "sensitive");
    assert.equal(log?.confirm, "always");
  });

  it("lets children add to the shopping list but not log expenses", () => {
    const child = toolsFor("child").map((tool) => tool.name);
    assert.ok(child.includes("shopping.add_item"));
    assert.ok(!child.includes("expenses.log"));
    assert.ok(!child.includes("income.to_enter"));
  });

  it("produces a valid JSON Schema object for every tool", () => {
    for (const tool of tools()) {
      const schema = toolInputJsonSchema(tool);
      assert.equal(schema.type, "object", tool.name);
      assert.ok(tool.description.length > 10, tool.name);
      assert.ok(tool.activity.en && tool.activity.nl, tool.name);
    }
  });
});

describe("skills", () => {
  const featureTools = () => listAssistantTools().filter((tool) => !tool.name.startsWith("test.") && !registered.includes(tool.name));

  it("gives every tool a registered skill", () => {
    const ids = new Set(listAssistantSkills().map((skill) => skill.id));
    for (const tool of featureTools()) assert.ok(ids.has(tool.skill), `${tool.name}: skill "${tool.skill}" is registered`);
  });

  it("keeps every guide short (≤ ~450 tokens) and every summary one line", () => {
    for (const skill of listAssistantSkills()) {
      assert.ok(estimateTokens(skill.guide) <= 450, `${skill.id}: guide is ${estimateTokens(skill.guide)} tokens`);
      assert.doesNotMatch(skill.summary, /\n/, `${skill.id}: summary is one line`);
      assert.ok(skill.title.en && skill.title.nl, `${skill.id}: titles in both languages`);
    }
  });

  it("keeps the always-on core set small", () => {
    const core = featureTools().filter((tool) => tool.core);
    assert.ok(core.length <= 8, `core tools: ${core.map((tool) => tool.name).join(", ")}`);
    for (const name of ["skills.load", "search.everything", "app.context", "app.help"]) assert.ok(core.some((tool) => tool.name === name), name);
    assert.ok(core.every((tool) => tool.permission === "read"), "core tools only read");
  });

  it("routes everyday questions in Dutch and English to the right skill", () => {
    const cases: [string, string][] = [
      ["Wat moet ik vandaag nog doen aan taken?", "tasks"],
      ["Zet melk op de boodschappenlijst", "shopping"],
      ["Welke facturen moeten we deze week betalen?", "expenses"],
      ["Welke vuilbak moet er vanavond buiten?", "waste"],
      ["Gaat het morgen regenen?", "weather"],
      ["How much electricity did we use yesterday?", "energy"],
      ["Is the alarm armed?", "alarm"],
      ["Mijn maaltijdcheques waren 160 euro", "income"],
      ["De belastingteruggave is binnen", "income"],
      ["Heeft Clara haar bijdrage al gestort op de gezamenlijke rekening?", "money"],
      ["Zitten we nog binnen budget met de verbouwing?", "projects"],
      ["Wat is er bijna op in de voorraad?", "inventory"],
      ["Welke winkels hebben een webshop?", "shops"],
      ["Verplaats de tandarts naar vrijdag", "calendar"],
      ["Ik heb de melk gekocht", "shopping"],
      ["Hoe groot is de keuken?", "places"],
      ["Teken een bureau van 3 op 2,8 meter rechts van de living", "floorplan"],
      ["Zet een deur in de zuidmuur van de woonkamer", "floorplan"],
      ["Doe het licht in de keuken uit", "devices"],
      ["Staan er ramen open?", "devices"],
      ["Open de garagepoort", "devices"],
      ["Waar is de handleiding van de vaatwasser?", "documents"],
      ["Noteer de meterstand: 12345 kWh", "energy"],
      ["Maak een uitnodiging voor Clara", "household"],
      ["Wie heeft de rekening van Fluvius gewijzigd?", "settings"],
      ["Heb ik nog ongelezen meldingen?", "settings"],
      ["Is the waste calendar automation working?", "automations"],
      ["Is my Google account connected?", "integrations"],
      ["Zoek de mail van de aannemer", "mail"],
      ["Mail Jan Peeters met de vraag of hij een offerte kan maken voor de badkamer renovatie", "mail"],
      ["Did the plumber reply to my email?", "mail"],
      ["Bewaar dit recept: https://www.kookboek.example/spaghetti", "recipes"],
      ["Wat heb ik nodig om lasagne te koken?", "recipes"],
      ["Which ingredients are missing for the curry recipe?", "recipes"],
    ];
    for (const [question, skill] of cases) {
      const matches = routeMessage(question).map((match) => match.id);
      assert.ok(matches.includes(skill), `"${question}" → ${skill} (got ${matches.join(", ") || "nothing"})`);
    }
  });
});
