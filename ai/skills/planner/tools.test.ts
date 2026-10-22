/**
 * The project planner: the plan checks (numbers in range, "waits for" loops, dates), the card's data and
 * totals, applying a plan with undo when a step fails, and who may plan. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/planner/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canManageProjects } from "@/features/projects/types/projects";
import { groupPlanMaterials, planTotals, projectPlanDataSchema } from "@/features/projects/types/project-plan";
import { HttpError } from "@/api/lib/http";
import { routeMessage } from "@ai/core/skills";
import { listAssistantTools, toolInputJsonSchema } from "@ai/core/tools";
import { money } from "@ai/core/kit";
import "@ai/skills";
import "./tools";
import { PlanApplyError, applyPlan, checkPlan, describePlan, draftOf, planInput, planPreviewData, resultLine, waitsForCycle, type PlanDraft, type PlanInput, type PlanOps } from "./plan";
import { failureMessage } from "./tools";

const TODAY = "2026-10-04";
const ref = (type: string, id: string, name: string, data?: unknown) => ({ type, id, name, data }) as never;

const task = (title: string, extra: { due?: string; waitsFor?: number[] } = {}) => ({ title, ...extra });

describe("checkPlan", () => {
  const base = { name: "Badkamer", tasks: [task("Uitbreken"), task("Leidingen", { waitsFor: [1] }), task("Tegelen", { waitsFor: [2] })], materials: [{ name: "Tegellijm", task: 3 }] };

  it("accepts a sound plan", () => {
    assert.deepEqual(checkPlan(base, TODAY), { errors: [], warnings: [] });
  });

  it("refuses task numbers out of range, waiting for itself and materials for a missing task", () => {
    const { errors } = checkPlan({ ...base, tasks: [task("A", { waitsFor: [4] }), task("B", { waitsFor: [2] }), task("C", { waitsFor: [0] })], materials: [{ name: "Lijm", task: 7 }] }, TODAY);
    assert.ok(errors.some((error) => /Task 1 waits for task 4, but there are 3 tasks/.test(error)), errors.join(" | "));
    assert.ok(errors.some((error) => /Task 2 can't wait for itself/.test(error)));
    assert.ok(errors.some((error) => /Task 3 waits for task 0/.test(error)));
    assert.ok(errors.some((error) => /Material “Lijm” is for task 7/.test(error)));
  });

  it("finds a waits-for loop, and only the tasks on it", () => {
    assert.deepEqual(waitsForCycle([{ waitsFor: [3] }, { waitsFor: [1] }, { waitsFor: [2] }, { waitsFor: [1] }]), [1, 2, 3]);
    assert.deepEqual(waitsForCycle([{}, { waitsFor: [1] }, { waitsFor: [1, 2] }]), []);
    const { errors } = checkPlan({ ...base, tasks: [task("A", { waitsFor: [2] }), task("B", { waitsFor: [1] })] }, TODAY);
    assert.ok(errors.some((error) => /Tasks 1, 2 wait for each other in a loop/.test(error)), errors.join(" | "));
  });

  it("refuses impossible dates and warns about awkward ones", () => {
    const past = checkPlan({ ...base, start: "2026-11-01", end: "2026-10-20", tasks: [task("A", { due: "2026-10-01" }), task("B", { due: "2026-02-30" })] }, TODAY);
    assert.ok(past.errors.some((error) => /end date is before the start/.test(error)));
    assert.ok(past.errors.some((error) => /Task 1 \(A\) is due 2026-10-01, in the past/.test(error)));
    assert.ok(past.errors.some((error) => /2026-02-30 is not a real date/.test(error)));

    const awkward = checkPlan({ ...base, start: "2026-10-10", end: "2026-10-31", tasks: [task("A", { due: "2026-10-20" }), task("B", { due: "2026-10-15", waitsFor: [1] }), task("C", { due: "2026-11-05" })] }, TODAY);
    assert.deepEqual(awkward.errors, []);
    assert.deepEqual(
      awkward.warnings.map(([en]) => en),
      ["“B” is due before “A”, which it waits for.", "“C” is due after the deadline."],
    );
    assert.match(awkward.warnings[1]?.[1] ?? "", /valt na de deadline/);
  });

  it("needs a name for a new project, something to plan, and only adds to an existing one", () => {
    assert.ok(checkPlan({ tasks: [task("A")], materials: [] }, TODAY).errors.some((error) => /needs a name/.test(error)));
    assert.ok(checkPlan({ name: "X", tasks: [], materials: [] }, TODAY).errors.some((error) => /at least one task or material/.test(error)));
    const existing = checkPlan({ project: {}, budget: 500, tasks: [task("A")], materials: [] }, TODAY);
    assert.ok(existing.errors.some((error) => /only adds tasks and materials/.test(error)));
    assert.deepEqual(checkPlan({ project: {}, name: "Tuin", tasks: [task("A")], materials: [] }, TODAY).errors, []);
  });
});

describe("plan input", () => {
  it("caps the lists and keeps a compact JSON schema", () => {
    const many = Array.from({ length: 41 }, (_, index) => ({ title: `Taak ${index}` }));
    assert.equal(planInput.safeParse({ name: "X", tasks: many }).success, false);
    assert.equal(planInput.safeParse({ name: "X", tasks: [{ title: "A" }], materials: [{ name: "Lijm", url: "ftp://x" }] }).success, false);
    const tool = listAssistantTools().find((candidate) => candidate.name === "projects.plan");
    assert.ok(tool, "projects.plan is registered");
    const schema = JSON.stringify(toolInputJsonSchema(tool));
    assert.ok(schema.length < 6000, `schema is ${schema.length} characters`);
  });
});

// ── Draft and card ──────────────────────────────────────────────────────────────────────────────────

function sampleInput(): PlanInput {
  return planInput.parse({
    name: "Badkamer renovatie",
    budget: 2000,
    start: "2026-10-12",
    end: "2026-11-27",
    places: ["Badkamer"],
    contact: "Peeters",
    notes: "Inloopdouche",
    tasks: [
      { title: "Uitbreken", who: ["Rob"], due: "2026-10-20", hours: 1.5 },
      { title: "Tegelen", place: "Bureau", who: ["Rob", "Sofie"], waitsFor: [1], checklist: ["Kruisjes", "Waterpas"] },
    ],
    materials: [
      { name: "Tegels", qty: 12.5, unit: "m²", task: 2, shop: "Tegelhuis", price: 34.95, url: "https://example.com/tegels" },
      { name: "Container", task: 1, price: 240 },
      { name: "Arbeid Peeters" },
    ],
  });
}

/** The parsed sample with its names resolved, as the tool's run receives it. */
function resolved(): PlanInput {
  const input = sampleInput();
  return {
    ...input,
    places: [ref("place", "p-bad", "Badkamer")],
    contact: ref("contact", "c-peeters", "Peeters Sanitair", { email: "info@example.com", trade: "Loodgieter" }),
    tasks: [
      { ...input.tasks[0]!, who: [ref("habitant", "h-rob", "Rob")] },
      { ...input.tasks[1]!, place: ref("place", "p-bureau", "Bureau"), who: [ref("habitant", "h-rob", "Rob"), ref("habitant", "h-sofie", "Sofie")] },
    ],
    materials: input.materials.map((material) => (material.shop ? { ...material, shop: ref("shop", "s-tegel", "Tegelhuis") } : material)),
  };
}

describe("the plan card", () => {
  it("maps a plan to valid card data with rooms, hours, prices and totals", () => {
    const draft = draftOf(resolved(), null, "#124734");
    assert.equal(draft.tasks[0]?.place?.name, "Badkamer", "a task without a room is in the project's only room");
    assert.equal(draft.tasks[1]?.place?.name, "Bureau");
    assert.equal(draft.tasks[0]?.minutes, 90);
    assert.equal(draft.materials[0]?.priceCents, 3495);
    assert.equal(draft.project.budgetCents, 200_000);

    const data = planPreviewData(draft, ["Let op"]);
    assert.ok(projectPlanDataSchema.safeParse(data).success);
    assert.equal(data.project.contact, "Peeters Sanitair (Loodgieter)", "the contact's trade is the default role");
    assert.equal(planPreviewData(draftOf({ ...resolved(), role: "aannemer" }, null, "#124734"), []).project.contact, "Peeters Sanitair (aannemer)");
    assert.deepEqual(data.tasks[1], { title: "Tegelen", place: "Bureau", who: ["Rob", "Sofie"], due: null, waitsFor: [1], hours: null, checklist: 2 });
    assert.equal(data.tasks[0]?.hours, 1.5);
    assert.deepEqual(data.materials[0], { name: "Tegels", quantity: 12.5, unit: "m²", task: 2, shop: "Tegelhuis", url: "https://example.com/tegels", priceCents: 3495 });

    const totals = planTotals(data);
    assert.equal(totals.materialsCents, Math.round(3495 * 12.5) + 24_000);
    assert.equal(totals.unpriced, 1);
    assert.equal(totals.status, "in_budget");
    assert.equal(planTotals({ ...data, project: { ...data.project, budgetCents: 50_000 } }).status, "over_budget");
    assert.equal(planTotals({ ...data, project: { ...data.project, usedCents: 140_000 } }).status, "over_budget", "an existing project's costs count");
  });

  it("groups materials by task (project-wide last) or by shop (no shop last)", () => {
    const data = planPreviewData(draftOf(resolved(), null, "#124734"), []);
    const labels = { wholeProject: "Whole project", noShop: "No shop" };
    assert.deepEqual(groupPlanMaterials(data, "task", labels).map((group) => group.label), ["1. Uitbreken", "2. Tegelen", "Whole project"]);
    assert.deepEqual(groupPlanMaterials(data, "shop", labels).map((group) => [group.label, group.materials.length]), [["Tegelhuis", 1], ["No shop", 2]]);
  });

  it("describes the card and the result in one line", () => {
    const input = resolved();
    assert.equal(describePlan("en", input), "Create the project Badkamer renovatie with 2 tasks and 3 materials");
    assert.equal(describePlan("nl", { ...input, project: { name: "Tuin" } }), "2 taken en 3 materialen toevoegen aan Tuin");
    const draft = draftOf(input, null, "#124734");
    assert.equal(resultLine(draft, { projectId: "p1", projectName: "Badkamer renovatie", tasks: [{ id: "t", title: "x", dueDate: null, assigneeIds: [] }], items: ["i1", "i2"] }, money), "Created Badkamer renovatie: 1 task, 2 materials, budget € 2.000,00.");
  });
});

// ── Applying ────────────────────────────────────────────────────────────────────────────────────────

type Call = [string, ...unknown[]];

function fakeOps(failOn?: { op: keyof PlanOps; nth: number }, failUndo = false) {
  const calls: Call[] = [];
  const counts = new Map<string, number>();
  let next = 0;
  const step = (op: keyof PlanOps) => {
    const count = (counts.get(op) ?? 0) + 1;
    counts.set(op, count);
    if (failOn && failOn.op === op && failOn.nth === count) throw new HttpError(400, "bad_request", `${op} broke`);
    if (failUndo && (op.startsWith("delete") || op === "unlinkContact")) throw new Error("database gone");
  };
  const ops: PlanOps = {
    createProject: async (input) => (step("createProject"), calls.push(["createProject", input]), { id: "proj", name: input.name }),
    setProjectDescription: async (id, description) => void (step("setProjectDescription"), calls.push(["setProjectDescription", id, description])),
    linkContact: async (projectId, contactId, role) => void (step("linkContact"), calls.push(["linkContact", projectId, contactId, role])),
    unlinkContact: async (projectId, contactId) => void (calls.push(["unlinkContact", projectId, contactId]), step("unlinkContact")),
    createTask: async (input) => {
      step("createTask");
      calls.push(["createTask", input]);
      return { id: `task${++next}`, title: input.title, dueDate: input.dueDate ?? null, assigneeIds: input.assigneeIds };
    },
    linkTasks: async (from, to) => void (step("linkTasks"), calls.push(["linkTasks", from, to])),
    createItem: async (input) => (step("createItem"), calls.push(["createItem", input]), { id: `item${++next}` }),
    deleteItem: async (id) => void (calls.push(["deleteItem", id]), step("deleteItem")),
    deleteTask: async (id) => void (calls.push(["deleteTask", id]), step("deleteTask")),
    deleteProject: async (id) => void (calls.push(["deleteProject", id]), step("deleteProject")),
  };
  return { ops, calls };
}

describe("applyPlan", () => {
  it("creates the project, the tasks in the project, their links and the materials of their task", async () => {
    const draft = draftOf(resolved(), null, "#124734");
    const { ops, calls } = fakeOps();
    const result = await applyPlan(draft, ops);
    assert.equal(result.projectId, "proj");
    assert.deepEqual(result.items.length, 3);

    const project = calls.find(([op]) => op === "createProject")?.[1] as { description: string; placeIds: string[]; budgetCents: number };
    assert.equal(project.description, "Inloopdouche");
    assert.deepEqual(project.placeIds, ["p-bad"]);
    assert.equal(project.budgetCents, 200_000);

    const tasks = calls.filter(([op]) => op === "createTask").map(([, input]) => input as { projectId: string; placeId: string; assigneeIds: string[]; estimatedMinutes: number | null; checklist: unknown[] });
    assert.ok(tasks.every((input) => input.projectId === "proj"));
    assert.deepEqual(tasks.map((input) => input.placeId), ["p-bad", "p-bureau"]);
    assert.deepEqual(tasks[1]?.assigneeIds, ["h-rob", "h-sofie"]);
    assert.equal(tasks[1]?.checklist.length, 2);

    assert.deepEqual(calls.filter(([op]) => op === "linkTasks"), [["linkTasks", "task2", "task1"]], "task 2 waits for task 1");

    const items = calls.filter(([op]) => op === "createItem").map(([, input]) => input as Record<string, unknown>);
    assert.deepEqual(
      items.map((item) => [item.name, item.taskId, item.projectId, item.placeId, item.source, item.shopId]),
      [
        ["Tegels", "task2", "proj", "p-bureau", "task", "s-tegel"],
        ["Container", "task1", "proj", "p-bad", "task", null],
        ["Arbeid Peeters", null, "proj", null, "task", null],
      ],
    );
    assert.deepEqual(calls.at(-1), ["linkContact", "proj", "c-peeters", "Loodgieter"], "the contractor is linked to the new project");
    assert.ok(!calls.some(([op]) => op.startsWith("delete")));
  });

  it("only adds to an existing project, the notes last", async () => {
    const input = { ...resolved(), project: ref("project", "p-old", "Badkamer"), name: undefined, budget: undefined, start: undefined, end: undefined, places: undefined };
    const draft = draftOf(input, { id: "p-old", name: "Badkamer", color: "#3b82b6", budgetCents: 500_000, usedCents: 120_000, start: null, end: null, places: [], description: "Oud plan" }, "#124734");
    const { ops, calls } = fakeOps();
    const result = await applyPlan(draft, ops);
    assert.equal(result.projectId, "p-old");
    assert.ok(!calls.some(([op]) => op === "createProject"));
    assert.deepEqual(calls.slice(-2), [
      ["linkContact", "p-old", "c-peeters", "Loodgieter"],
      ["setProjectDescription", "p-old", "Oud plan\n\nInloopdouche"],
    ]);
    assert.equal(planPreviewData(draft, []).project.usedCents, 120_000);

    const linked = draftOf(input, { id: "p-old", name: "Badkamer", color: "#3b82b6", budgetCents: null, usedCents: 0, start: null, end: null, places: [], description: "Inloopdouche", contactIds: ["c-peeters"] }, "#124734");
    const again = fakeOps();
    await applyPlan(linked, again.ops);
    assert.ok(!again.calls.some(([op]) => op === "linkContact" || op === "setProjectDescription"), "nothing to add: already linked, notes already there");
  });

  it("unlinks the contact from an existing project when a later step fails", async () => {
    const input = { ...resolved(), project: ref("project", "p-old", "Badkamer"), places: undefined };
    const draft = draftOf(input, { id: "p-old", name: "Badkamer", color: "#3b82b6", budgetCents: null, usedCents: 0, start: null, end: null, places: [], description: null }, "#124734");
    const { ops, calls } = fakeOps({ op: "setProjectDescription", nth: 1 });
    await assert.rejects(applyPlan(draft, ops), PlanApplyError);
    const undo = calls.filter(([op]) => op === "unlinkContact" || op.startsWith("delete")).map(([op]) => op);
    assert.deepEqual(undo, ["unlinkContact", "deleteItem", "deleteItem", "deleteItem", "deleteTask", "deleteTask"]);
  });

  it("removes everything it created when a step fails, newest first", async () => {
    const draft = draftOf(resolved(), null, "#124734");
    const { ops, calls } = fakeOps({ op: "createItem", nth: 3 });
    const error = await applyPlan(draft, ops).then(
      () => null,
      (failure: unknown) => failure,
    );
    assert.ok(error instanceof PlanApplyError);
    assert.equal(error.undone, true);
    assert.match(error.step, /Adding material 3 \(Arbeid Peeters\)/);
    assert.deepEqual(
      calls.filter(([op]) => op.startsWith("delete")),
      [
        ["deleteItem", "item4"],
        ["deleteItem", "item3"],
        ["deleteTask", "task2"],
        ["deleteTask", "task1"],
        ["deleteProject", "proj"],
      ],
    );
    assert.match(failureMessage(error), /^Nothing was saved: Adding material 3 \(Arbeid Peeters\) failed \(createItem broke\)/);
  });

  it("says so when undoing fails too", async () => {
    const { ops } = fakeOps({ op: "linkTasks", nth: 1 }, true);
    const error = await applyPlan(draftOf(resolved(), null, "#124734"), ops).catch((failure: unknown) => failure);
    assert.ok(error instanceof PlanApplyError);
    assert.equal(error.undone, false);
    assert.match(failureMessage(error), /removing what was already created failed too/);
  });

  it("leaves an existing project alone when its first task fails", async () => {
    const input = { ...resolved(), project: ref("project", "p-old", "Badkamer"), places: undefined };
    const draft: PlanDraft = draftOf(input, { id: "p-old", name: "Badkamer", color: "#3b82b6", budgetCents: null, usedCents: 0, start: null, end: null, places: [], description: null }, "#124734");
    const { ops, calls } = fakeOps({ op: "createTask", nth: 1 });
    await assert.rejects(applyPlan(draft, ops), PlanApplyError);
    assert.ok(!calls.some(([op]) => op === "deleteProject"));
  });
});

describe("who may plan", () => {
  it("is a confirmed write for owners and adults only, like creating projects in the app", () => {
    const tool = listAssistantTools().find((candidate) => candidate.name === "projects.plan");
    assert.ok(tool);
    assert.equal(tool.skill, "planner");
    assert.equal(tool.permission, "write");
    assert.equal(tool.confirm, "always");
    assert.deepEqual([...tool.roles].sort(), ["adult", "owner"]);
    assert.equal(tool.roles.includes("child"), canManageProjects("child"));
  });

  it("routes planning questions to the planner", () => {
    for (const question of [
      "We renoveren de badkamer: nieuwe tegels, douche en wc, maak een plan",
      "Kun je een planning maken voor de verbouwing van de keuken?",
      "Plan the bathroom renovation with contractor Peeters",
      "Make a materials list for painting the bedroom",
    ]) {
      const matches = routeMessage(question).map((match) => match.id);
      assert.ok(matches.includes("planner"), `"${question}" → planner (got ${matches.join(", ") || "nothing"})`);
    }
  });
});
