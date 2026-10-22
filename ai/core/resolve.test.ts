/**
 * Entity resolvers: fuzzy names (case, accents, partial names, plurals, typos), "ik/me", ambiguity and
 * not-found messages, dates in task titles, and `entityRef` inside tool input. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/resolve.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { z } from "zod";
import type { SessionUser } from "@/features/auth/types/auth";
import { prepareInput } from "./assistant-loop";
import { entityRef, invalidateEntityCache, registerEntityResolver, resolveEntity, resolveRefs, scoreCandidates, unregisterEntityResolver, type ResolvedEntity } from "./resolve";
import { searchEverything } from "./search";
import { closeWords, fold, nameScore, splitDate, stem } from "./text-match";
import { registerAssistantTool, unregisterAssistantTool, type AssistantToolContext } from "./tools";

const user: SessionUser = { id: "u1", email: "rob@example.com", name: "Rob", role: "adult", locale: "nl", householdId: "h-resolve", householdName: "Test", habitantId: "rob" };
const ctx: AssistantToolContext = { user, householdId: user.householdId, locale: "nl", signal: new AbortController().signal, channel: "chat" };

let listCalls = 0;
registerEntityResolver({
  type: "habitant",
  label: "person",
  list: async () => {
    listCalls += 1;
    return [
      { id: "rob", name: "Rob Coppens", aliases: ["Rob"], self: true, hint: "adult" },
      { id: "clara", name: "Clara Peeters", aliases: ["Clara"], hint: "adult" },
      { id: "jan1", name: "Jan Peeters", hint: "adult" },
      { id: "jan2", name: "Jan De Smet", hint: "child" },
      { id: "zoe", name: "Zoë", hint: "child" },
    ];
  },
});
registerEntityResolver({
  type: "task",
  label: "task",
  search: async () => [
    { id: "t1", name: "Vuilnis buiten zetten", date: "2026-10-07" },
    { id: "t2", name: "Vuilnis buiten zetten", date: "2026-10-14" },
    { id: "t3", name: "Gras maaien", date: null },
  ],
});
registerEntityResolver({
  type: "account",
  label: "payment account",
  list: async () => [
    { id: "a1", name: "KBC zicht", aliases: ["gezamenlijke rekening"] },
    { id: "a2", name: "KBC spaar", aliases: ["spaarrekening"] },
  ],
});
after(() => {
  unregisterEntityResolver("habitant");
  unregisterEntityResolver("task");
  unregisterEntityResolver("account");
});

describe("text matching", () => {
  it("folds case and accents, and stems Dutch and English plurals alike", () => {
    assert.equal(fold("  Één  Kéuken "), "een keuken");
    assert.equal(stem("taken"), stem("taak"));
    assert.equal(stem("boodschappen"), stem("boodschap"));
    assert.equal(stem("bills"), stem("bill"));
    assert.ok(closeWords("keukn", "keuken"), "small typo");
    assert.ok(!closeWords("kat", "bad"));
  });

  it("scores exact, leading, partial and contained names", () => {
    assert.equal(nameScore("clara peeters", "Clara Peeters"), 100);
    assert.equal(nameScore("Clara", "Clara Peeters"), 85);
    assert.ok(nameScore("de keuken", "Keuken") >= 55);
    assert.ok(nameScore("woonkmer", "Woonkamer") >= 45);
    assert.equal(nameScore("garage", "Keuken"), 0);
  });

  it("splits a date out of a query", () => {
    assert.deepEqual(splitDate("Vuilnis buiten 2026-10-07", 2026), { text: "Vuilnis buiten", date: "2026-10-07" });
    assert.deepEqual(splitDate("tandarts 7/10", 2026), { text: "tandarts", date: "2026-10-07" });
    assert.deepEqual(splitDate("gras", 2026), { text: "gras", date: null });
  });
});

describe("resolveEntity", () => {
  it("finds people by first name, ignoring accents, and 'ik' as the person asking", async () => {
    assert.deepEqual(await resolveEntity(ctx, "habitant", "clara"), { ok: true, entity: { type: "habitant", id: "clara", name: "Clara Peeters", hint: "adult" } });
    assert.equal(((await resolveEntity(ctx, "habitant", "Zoe")) as { entity: ResolvedEntity }).entity.id, "zoe");
    assert.equal(((await resolveEntity(ctx, "habitant", "ik")) as { entity: ResolvedEntity }).entity.id, "rob");
    assert.equal(((await resolveEntity(ctx, "habitant", "me")) as { entity: ResolvedEntity }).entity.id, "rob");
    assert.equal(((await resolveEntity(ctx, "habitant", "jan2")) as { entity: ResolvedEntity }).entity.id, "jan2", "an id works too");
  });

  it("asks which one when a name is ambiguous, and lists the known names when nothing matches", async () => {
    const ambiguous = await resolveEntity(ctx, "habitant", "Jan");
    assert.equal(ambiguous.ok, false);
    assert.match((ambiguous as { error: string }).error, /Which person do you mean by "Jan": "Jan De Smet \(child\)" or "Jan Peeters \(adult\)"/);
    const unknown = await resolveEntity(ctx, "habitant", "Bart");
    assert.match((unknown as { error: string }).error, /No person matches "Bart"\. Known: Rob Coppens/);
  });

  it("picks the task with the date given, and asks when two share a title", async () => {
    const both = await resolveEntity(ctx, "task", "vuilnis buiten zetten");
    assert.equal(both.ok, false);
    const dated = await resolveEntity(ctx, "task", "vuilnis buiten zetten 2026-10-14");
    assert.equal((dated as { entity: ResolvedEntity }).entity.id, "t2");
  });

  it("matches aliases like 'gezamenlijke rekening'", async () => {
    assert.equal(((await resolveEntity(ctx, "account", "de gezamenlijke rekening")) as { entity: ResolvedEntity }).entity.id, "a1");
    assert.equal(((await resolveEntity(ctx, "account", "spaarrekening")) as { entity: ResolvedEntity }).entity.id, "a2");
  });

  it("caches listed candidates until a write invalidates them", async () => {
    invalidateEntityCache(ctx.householdId);
    const before = listCalls;
    await resolveEntity(ctx, "habitant", "Clara");
    await resolveEntity(ctx, "habitant", "Rob");
    assert.equal(listCalls, before + 1);
    invalidateEntityCache(ctx.householdId);
    await resolveEntity(ctx, "habitant", "Rob");
    assert.equal(listCalls, before + 2);
  });

  it("says when a type has no resolver", async () => {
    const outcome = await resolveEntity(ctx, "device", "thermostaat");
    assert.match((outcome as { error: string }).error, /can't look up device/);
  });

  it("ranks candidates, best first", () => {
    const scored = scoreCandidates("clara", [
      { id: "1", name: "Clara" },
      { id: "2", name: "Clara Peeters" },
    ]);
    assert.deepEqual(scored.map((entry) => entry.candidate.id), ["1", "2"]);
  });
});

describe("entityRef in tool input", () => {
  const tool = registerAssistantTool({
    name: "resolvetest.assign",
    description: "Assign people.",
    input: z.object({ who: entityRef("habitant"), helpers: z.array(entityRef("habitant")).optional(), note: z.string().optional() }),
    permission: "write",
    confirm: "always",
    activity: { en: "Assigned", nl: "Toegewezen" },
    run: (_ctx, input) => ({ who: input.who.id, helpers: input.helpers?.map((helper) => helper.id) }),
  });
  after(() => unregisterAssistantTool(tool.name));

  it("is a plain string for the model", () => {
    const schema = z.toJSONSchema(tool.input, { io: "input" }) as { properties: Record<string, { type?: string; items?: { type?: string } }> };
    assert.equal(schema.properties.who?.type, "string");
    assert.equal(schema.properties.helpers?.items?.type, "string");
  });

  it("is resolved before the tool runs, also inside arrays", async () => {
    const prepared = await prepareInput(tool, ctx, { who: "Clara", helpers: ["ik", "Zoë"], note: "x" });
    assert.equal(prepared.ok, true);
    const data = (prepared as { data: { who: ResolvedEntity; helpers: ResolvedEntity[]; note: string } }).data;
    assert.equal(data.who.id, "clara");
    assert.deepEqual(data.helpers.map((helper) => helper.id), ["rob", "zoe"]);
    assert.equal(data.note, "x");
  });

  it("reports every unresolved name in one message", async () => {
    const prepared = await prepareInput(tool, ctx, { who: "Jan", helpers: ["Bart"] });
    assert.equal(prepared.ok, false);
    assert.match((prepared as { error: string }).error, /Which person.*No person matches "Bart"/s);
  });

  it("leaves input without references untouched", async () => {
    const data = { a: 1, b: [1, 2] };
    assert.deepEqual(await resolveRefs(ctx, data), { ok: true, data });
  });
});

describe("search_everything", () => {
  it("searches every resolver and returns compact hits", async () => {
    const { hits } = await searchEverything(ctx, "peeters");
    assert.deepEqual(hits.map((hit) => hit.id).sort(), ["clara", "jan1"]);
    assert.ok(hits.every((hit) => hit.type === "habitant" && hit.title));
  });

  it("filters by type", async () => {
    const { hits } = await searchEverything(ctx, "gras", { types: ["task"] });
    assert.deepEqual(hits.map((hit) => hit.id), ["t3"]);
  });
});
