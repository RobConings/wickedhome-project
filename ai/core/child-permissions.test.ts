/**
 * Children and the assistant's tools: every registered tool runs as a child (Lena) with representative
 * arguments, and nothing a child may not do gets past the runner, in the chat (the gate before a confirmation
 * card) and when it runs (chat confirmations and MCP).
 *
 * - A tool children may not use is refused before anything else, whatever the arguments; the owner passes
 *   the same gate (so the refusal is the role, not the arguments).
 * - A tool children may use for some actions only (`refuse`, e.g. stock: use and add, not set a count) has a
 *   row in CHILD_CASES with its allowed and refused arguments; refused ones never reach `run` and come back
 *   with a reason the model can relay. A new child write tool without a row fails here.
 *
 * Names resolve through fake resolvers and every tool's `run` is a spy, so nothing touches the database:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/child-permissions.test.ts
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AssistantStreamEvent } from "@/features/assistant/types/assistant";
import type { SessionUser } from "@/features/auth/types/auth";
import "@ai/skills";
import "./core-tools";
import { NOT_ALLOWED, prepareInput, runAssistantLoop, runTool, type LoopDeps, type LoopMessage } from "./assistant-loop";
import type { ChatModel } from "./llm-client";
import { ENTITY_TYPES, getEntityResolver, registerEntityResolver, unregisterEntityResolver, type EntityResolver } from "./resolve";
import { listAssistantTools, toolInputJsonSchema, toolsFor, type AssistantToolContext, type JsonSchema, type RegisteredAssistantTool } from "./tools";

const person = (role: SessionUser["role"]): SessionUser => ({
  id: `u-${role}`,
  email: `${role}@example.be`,
  name: role === "child" ? "Lena" : "Rob",
  role,
  locale: "nl",
  householdId: "h1",
  householdName: "Test",
  habitantId: `hab-${role}`,
});
const contextOf = (role: SessionUser["role"]): AssistantToolContext => ({ user: person(role), householdId: "h1", locale: "nl", signal: new AbortController().signal, channel: "chat" });

type ChildCase = { args: Record<string, unknown>; allowed: boolean; reason?: RegExp };

/**
 * Every write a child may use, with representative arguments: what runs for a child and what is refused.
 * "Allowed" means the tool lets it through to its service, which still checks (e.g. only their own tasks).
 */
const CHILD_CASES: Record<string, ChildCase[]> = {
  "inventory.change_stock": [
    { args: { product: "Rijst", action: "use", amount: 1 }, allowed: true },
    { args: { product: "Rijst", action: "add", amount: 2 }, allowed: true },
    { args: { product: "Rijst", action: "set", amount: 5, note: "Minimum aangepast naar 5" }, allowed: false, reason: /adults/ },
  ],
  "integrations.sync": [
    { args: { what: "calendar" }, allowed: true },
    { args: { what: "mail" }, allowed: false, reason: /not for children/ },
  ],
  "integrations.set_calendar": [{ args: { calendar: "School", visibility: "private" }, allowed: true }],
  "recipes.use": [{ args: { ingredient: "look", quantity: 1 }, allowed: true }],
  "recipes.add_ingredient": [
    { args: { name: "Paprikapoeder" }, allowed: true },
    { args: { name: "Paprikapoeder", saveToRecipe: true }, allowed: false, reason: /adults/ },
  ],
  "recipes.go_to_step": [{ args: { move: "next" }, allowed: true }],
  "recipes.done": [{ args: {}, allowed: true }],
  "shopping.add_item": [{ args: { name: "Chocomelk" }, allowed: true }],
  "shopping.update_item": [{ args: { item: "Brood", bought: true }, allowed: true }],
  "shopping.remove": [
    { args: { item: "Brood" }, allowed: true },
    { args: { list: "Brico" }, allowed: false, reason: /adults/ },
    { args: { staple: "Melk" }, allowed: false, reason: /adults/ },
  ],
  "shops.favorite": [{ args: { shop: "Delhaize" }, allowed: true }],
  "settings.set_language": [{ args: { language: "en" }, allowed: true }],
  "settings.mark_read": [{ args: {}, allowed: true }],
  "settings.set_notification_prefs": [{ args: { quietHours: true, quietFrom: "21:00", quietUntil: "07:00" }, allowed: true }],
  "tasks.complete": [{ args: { task: "Gras maaien" }, allowed: true }],
  "tasks.comment": [{ args: { task: "Gras maaien", text: "Bijna klaar" }, allowed: true }],
  "tasks.check_item": [{ args: { task: "Gras maaien", item: "Benzine bijvullen" }, allowed: true }],
};

/** Plausible arguments from a tool's JSON Schema: its required fields with a value of the right shape. */
function sample(schema: JsonSchema): unknown {
  const values = schema.enum as unknown[] | undefined;
  if (values?.length) return values[0];
  const options = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (options?.length) return sample(options[0] ?? {});
  switch (schema.type) {
    case "string": {
      const pattern = String(schema.pattern ?? "");
      if (pattern.includes(":")) return "08:00";
      if (pattern.includes("{4}-") && pattern.includes("{2}-")) return "2026-10-05";
      if (pattern.includes("{4}-")) return "2026-10";
      if (schema.format === "uri") return "https://example.be";
      if (schema.format === "email") return "lena@example.be";
      return "Gras maaien";
    }
    case "number":
    case "integer":
      return typeof schema.minimum === "number" ? Math.max(schema.minimum, 1) : typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum + 1 : 1;
    case "boolean":
      return true;
    case "array":
      return [sample((schema.items as JsonSchema | undefined) ?? { type: "string" })];
    case "object": {
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = (schema.required ?? []) as string[];
      return Object.fromEntries(required.map((key) => [key, sample(properties[key] ?? { type: "string" })]));
    }
    default:
      return "Gras maaien";
  }
}

// Every `run` becomes a spy, every entity type resolves any name: no database, and we see what would run.
const ran: { tool: string; input: unknown }[] = [];
const originalRuns = new Map<RegisteredAssistantTool, RegisteredAssistantTool["run"]>();
const originalResolvers = new Map<string, EntityResolver | undefined>();
before(() => {
  for (const tool of listAssistantTools()) {
    originalRuns.set(tool, tool.run);
    tool.run = (_ctx, input) => {
      ran.push({ tool: tool.name, input });
      return { ok: true };
    };
  }
  for (const type of ENTITY_TYPES) {
    originalResolvers.set(type, getEntityResolver(type));
    registerEntityResolver({ type, label: type, search: async (_ctx, query) => [{ id: `id-${query}`, name: query }] });
  }
});
after(() => {
  for (const [tool, run] of originalRuns) tool.run = run;
  for (const [type, resolver] of originalResolvers) {
    if (resolver) registerEntityResolver(resolver);
    else unregisterEntityResolver(type as (typeof ENTITY_TYPES)[number]);
  }
});

const ranFor = (name: string) => ran.filter((entry) => entry.tool === name).length;

describe("a child's tool calls", () => {
  it("has a row for every write a child may use (and only for those)", () => {
    const childWrites = listAssistantTools()
      .filter((tool) => tool.roles.includes("child") && tool.permission !== "read")
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(childWrites, Object.keys(CHILD_CASES).sort(), "add the new tool's child cases to CHILD_CASES");
  });

  it("refuses every tool children may not use, before anything runs, whatever the arguments", async () => {
    const child = contextOf("child");
    const owner = contextOf("owner");
    const forbidden = listAssistantTools().filter((tool) => !tool.roles.includes("child"));
    assert.ok(forbidden.length > 50, "most tools are for adults");
    for (const tool of forbidden) {
      const args = sample(toolInputJsonSchema(tool));
      const runsBefore = ranFor(tool.name);
      assert.deepEqual(await prepareInput(tool, child, args), { ok: false, error: NOT_ALLOWED }, `${tool.name}: no confirmation card for a child`);
      assert.deepEqual(await runTool(tool, child, args), { ok: false, error: NOT_ALLOWED }, `${tool.name}: never runs for a child`);
      assert.equal(ranFor(tool.name), runsBefore, `${tool.name} did not run`);
      const asOwner = await prepareInput(tool, owner, args);
      assert.ok(asOwner.ok || asOwner.error !== NOT_ALLOWED, `${tool.name}: the owner passes the same gate`);
    }
  });

  it("lets a child's reads through the gate", async () => {
    const child = contextOf("child");
    for (const tool of listAssistantTools().filter((candidate) => candidate.roles.includes("child") && candidate.permission === "read")) {
      const outcome = await prepareInput(tool, child, sample(toolInputJsonSchema(tool)));
      assert.ok(outcome.ok || outcome.error !== NOT_ALLOWED, `${tool.name} is readable for children`);
    }
  });

  for (const [name, cases] of Object.entries(CHILD_CASES)) {
    for (const { args, allowed, reason } of cases) {
      it(`${name} ${JSON.stringify(args)}: ${allowed ? "runs" : "refused"} for a child`, async () => {
        const tool = listAssistantTools().find((candidate) => candidate.name === name);
        assert.ok(tool, `${name} is registered`);
        const child = contextOf("child");
        const gate = await prepareInput(tool, child, args);
        const runsBefore = ranFor(name);
        const result = await runTool(tool, child, args);
        if (allowed) {
          assert.ok(gate.ok, `${name}: ${gate.ok ? "" : gate.error}`);
          assert.ok(result.ok, `${name}: ${result.ok ? "" : result.error}`);
          assert.equal(ranFor(name), runsBefore + 1, `${name} ran`);
        } else {
          assert.ok(!gate.ok && reason?.test(gate.error), `${name}: refused before a confirmation card, with a reason (${gate.ok ? "passed" : gate.error})`);
          assert.ok(!result.ok && reason?.test(result.error), `${name}: refused when run`);
          assert.equal(ranFor(name), runsBefore, `${name} did not run`);
          // An adult may.
          assert.ok((await prepareInput(tool, contextOf("adult"), args)).ok, `${name}: allowed for an adult`);
        }
      });
    }
  }
});

describe("a child's forbidden call in the chat", () => {
  it("shows no confirmation card: the model gets the reason and relays it", async () => {
    const steps = [
      { content: "", toolCalls: [{ id: "c1", type: "function" as const, function: { name: "inventory_change_stock", arguments: JSON.stringify({ product: "Rijst", action: "set", amount: 5 }) } }] },
      { content: "Dat mag alleen een volwassene.", toolCalls: [] },
    ];
    const model: ChatModel = async () => ({ ...(steps.shift() ?? { content: "?", toolCalls: [] }), finishReason: "stop" });
    const events: AssistantStreamEvent[] = [];
    const history: LoopMessage[] = [{ id: "q1", role: "user", content: "Zet het minimum van de rijst op 5" }];
    let id = 0;
    const deps: LoopDeps = {
      model,
      tools: toolsFor("child"),
      ctx: contextOf("child"),
      systemPrompt: "Test",
      rememberedSkips: new Set(),
      save: async (message) => ({ ...message, id: `m${(id += 1)}` }),
      update: async () => undefined,
      remember: async () => undefined,
      emit: (event) => events.push(event),
    };
    const runsBefore = ranFor("inventory.change_stock");
    assert.equal(await runAssistantLoop(history, deps), "done");
    assert.ok(!events.some((event) => event.type === "confirm"), "no card");
    const call = history.find((message) => message.role === "tool");
    assert.equal(call?.toolStatus, "failed");
    assert.match(call?.toolResult && !call.toolResult.ok ? call.toolResult.error : "", /adults/);
    assert.equal(ranFor("inventory.change_stock"), runsBefore);
  });
});
