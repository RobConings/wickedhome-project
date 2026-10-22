import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import type { SessionUser } from "@/features/auth/types/auth";
import { db } from "@/api/lib/db";
import { resultForModel, runTool } from "@ai/core/assistant-loop";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import { getEntityResolver, invalidateEntityCache, registerEntityResolver, unregisterEntityResolver } from "@ai/core/resolve";
import { getAssistantSkill } from "@ai/core/skills";
import { getAssistantTool, type AssistantToolContext } from "@ai/core/tools";
import "./tools";

const TODAY = "2026-10-14";
const user: SessionUser = {
  id: "task-user", email: "test@example.com", name: "Rob", role: "adult", locale: "en",
  householdId: "task-names-household", householdName: "Test", habitantId: "rob",
};
const signal = new AbortController().signal;
const context: AssistantToolContext = { user, householdId: user.householdId, locale: "en", channel: "chat", signal };

function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original: unknown = Reflect.get(target, key);
  const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement);
  t.after(() => { Reflect.set(target, key, original); });
  return replacement;
}

function row(id: string, title: string, assigneeIds: string[] = [], dueDate: string | null = TODAY, status = "OPEN") {
  return {
    id, title, householdId: user.householdId, notes: null, type: "TODO", place: null, placeId: null,
    assignees: assigneeIds.map((habitantId, position) => ({ habitantId, position })), rotateAssignees: false,
    priority: "NORMAL", estimatedMinutes: null, status,
    dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
    dueTime: null as string | null, endTime: null, startDate: null, rrule: null, recurrenceStart: null,
    checklist: [], links: [], _count: { comments: 0 }, project: null,
    closedAt: status === "OPEN" ? null : new Date(`${TODAY}T16:00:00Z`),
    reminderMinutes: null, remindAt: null, remindedAt: null,
    originType: null, originId: null, originDate: null, originHref: null,
    heldAt: null, holdReason: null,
  };
}

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${TODAY}T18:00:00Z`) });
  invalidateEntityCache(user.householdId);
  const originalResolver = getEntityResolver("habitant");
  registerEntityResolver({
    type: "habitant", label: "person", skill: "household",
    list: async (ctx) => [
      { id: "rob", name: "Rob", self: ctx.user.habitantId === "rob" },
      { id: "clara", name: "Clara", self: ctx.user.habitantId === "clara" },
    ],
  });
  t.after(() => {
    if (originalResolver) registerEntityResolver(originalResolver);
    else unregisterEntityResolver("habitant");
    invalidateEntityCache(user.householdId);
  });
  const rows = [
    row("invoice", "Pay invoice"), row("deliveries", "Check deliveries"), row("water", "Check water softener"),
    row("done", "Take out rubbish", ["rob"], TODAY, "DONE"),
  ];
  stub(t, db.task, "findMany", async ({ where }: { where: { householdId: string } }) => {
    assert.equal(where.householdId, user.householdId);
    return rows;
  });
  stub(t, db.taskCompletion, "findMany", async () => [{
    id: "completion", taskId: "done", outcome: "DONE", occurrenceDate: new Date(`${TODAY}T00:00:00Z`),
    completedAt: new Date(`${TODAY}T16:00:00Z`), completedById: "rob",
  }]);
  stub(t, db.shoppingItem, "groupBy", async () => []);
  return { rows };
}

type NamedTask = { id: string; title: string; who: string[]; assignment: string; due?: string | null };
type Result = {
  summaryScope: string; open: number; today: string; matchingCount: number; items: NamedTask[];
  todayRemaining: { count: number; items: NamedTask[]; more?: number };
  filters: { filter: string; person?: string | null }; note?: string | null;
};

async function mcp(args: Record<string, unknown>, actingUser = user) {
  const response = await handleMcpMessage({
    jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tasks_list_open", arguments: args },
  }, { user: actingUser, scope: "read", tokenId: "test", tokenName: "Test" }, signal) as {
    result: { isError: boolean; structuredContent: Result; content: { text: string }[] };
  };
  assert.equal(response.result.isError, false, response.result.content[0]?.text);
  return response.result.structuredContent;
}

const titles = (items: NamedTask[]) => items.map((item) => item.title).sort();
const remaining = ["Pay invoice", "Check deliveries", "Check water softener"].sort();

describe("task names alongside household progress", () => {
  it("exposes the three remaining titles when a personal today filter has no assigned tasks", async (t) => {
    setup(t);
    const result = await mcp({ filter: "today", person: "me" });
    assert.equal(result.today, "1 of 4 done");
    assert.equal(result.summaryScope, "household");
    assert.equal(result.matchingCount, 0);
    assert.deepEqual(result.items, []);
    assert.equal(result.todayRemaining.count, 3);
    assert.deepEqual(titles(result.todayRemaining.items), remaining);
    assert.ok(result.todayRemaining.items.every((item) => item.assignment === "unassigned" && item.who.length === 0));
    assert.equal(result.filters.person, "Rob");
    assert.match(result.note ?? "", /No tasks match.*household tasks.*title/);
  });

  it("returns all-day task names for tonight with the today filter", async (t) => {
    setup(t);
    const result = await mcp({ filter: "today" });
    assert.equal(result.matchingCount, 3);
    assert.deepEqual(titles(result.items), remaining);
    assert.deepEqual(titles(result.todayRemaining.items), remaining);
    assert.ok(result.items.every((item) => item.due === TODAY && item.id));
  });

  it("keeps assigned results separate from remaining household tasks", async (t) => {
    const { rows } = setup(t);
    rows.push(row("rob-tomorrow", "My task tomorrow", ["rob"], "2026-10-15"));
    rows.push(row("clara", "Clara's evening task", ["clara"]));
    const result = await mcp({ filter: "mine" });
    assert.equal(result.matchingCount, 1);
    assert.deepEqual(titles(result.items), ["My task tomorrow"]);
    assert.equal(result.items[0]?.assignment, "assigned");
    assert.deepEqual(result.items[0]?.who, ["Rob"]);
    assert.equal(result.todayRemaining.count, 4);
    const other = result.todayRemaining.items.find((item) => item.id === "clara");
    assert.equal(other?.assignment, "assigned");
    assert.deepEqual(other?.who, ["Clara"]);
  });

  it("uses the current person on duty for rotating chores", async (t) => {
    const { rows } = setup(t);
    const rotating = row("rotating", "Rotating chore", ["clara", "rob"]);
    rotating.rotateAssignees = true;
    rows.push(rotating);
    const result = await mcp({ filter: "today", person: "me" });
    assert.deepEqual(result.items, []);
    const chore = result.todayRemaining.items.find((item) => item.id === "rotating");
    assert.deepEqual(chore?.who, ["Clara"]);
  });

  it("explains an unlinked account without hiding household task names", async (t) => {
    setup(t);
    const result = await mcp({ filter: "mine" }, { ...user, habitantId: null });
    assert.equal(result.matchingCount, 0);
    assert.match(result.note ?? "", /not linked to a household member/);
    assert.deepEqual(titles(result.todayRemaining.items), remaining);
  });

  it("provides the same names to the local assistant after result compaction", async (t) => {
    setup(t);
    const tool = getAssistantTool("tasks.list_open");
    assert.ok(tool);
    const outcome = await runTool(tool, context, { filter: "today", person: "me" });
    assert.ok(outcome.ok);
    const sent = JSON.parse(resultForModel(outcome)) as { data: Result };
    assert.equal(sent.data.matchingCount, 0);
    assert.equal(sent.data.summaryScope, "household");
    assert.deepEqual(titles(sent.data.todayRemaining.items), remaining);
  });

  it("caps a long household list with an accurate remaining count", async (t) => {
    const { rows } = setup(t);
    for (let index = 0; index < 22; index++) rows.push(row(`extra-${index}`, `Extra chore ${index}`));
    const result = await mcp({ filter: "mine" });
    assert.equal(result.matchingCount, 0);
    assert.equal(result.todayRemaining.count, 25);
    assert.equal(result.todayRemaining.items.length, 20);
    assert.equal(result.todayRemaining.more, 5);
  });

  it("advertises titles, scope and tonight's all-day tasks to MCP and the model", () => {
    const tool = getAssistantTool("tasks.list_open");
    assert.ok(tool);
    assert.match(tool.description, /Task names/);
    assert.match(tool.description, /tonight use today/);
    assert.match(tool.description, /mine\/person exclude unassigned/);
    assert.match(getAssistantSkill("tasks")?.guide ?? "", /Never claim names are inaccessible/);
  });
});
