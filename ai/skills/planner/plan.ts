import { z } from "zod";
import type { ProjectInput } from "@/features/projects/types/projects";
import { MAX_PLAN_MATERIALS, MAX_PLAN_TASKS, type ProjectPlanData } from "@/features/projects/types/project-plan";
import { webUrlSchema, type ShoppingItemCreateInput } from "@/features/shopping/types/shopping";
import type { TaskInput } from "@/features/tasks/types/tasks";
import { addDays } from "@/types/dates";
import { entityRef, optionalDateSchema, say } from "@ai/core/kit";

/**
 * The project planner's pure parts, so the tests need no database: the tool's input, the checks (numbers in
 * range, no "waits for" loops, sane dates), the card's data, and applying a plan through injected service
 * calls with undo on failure. The tool itself (ai/skills/planner/tools.ts) wires the real services.
 */

// ── Input ───────────────────────────────────────────────────────────────────────────────────────────

const taskSchema = z.object({
  title: z.string().trim().min(1).max(120),
  place: entityRef("place").optional(),
  who: z.array(entityRef("habitant", "First name or 'me'")).max(5).optional(),
  due: optionalDateSchema("Due YYYY-MM-DD"),
  waitsFor: z.array(z.number().int()).max(10).optional().describe("Numbers of the tasks in this list (first = 1) that must be done first"),
  hours: z.number().positive().max(168).optional().describe("Estimated work in hours"),
  checklist: z.array(z.string().trim().min(1).max(200)).max(15).optional(),
  notes: z.string().trim().max(500).optional(),
});

const materialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  qty: z.number().positive().max(100_000).optional().describe("Default 1"),
  unit: z.string().trim().max(20).optional().describe("e.g. m², pcs, kg, l"),
  task: z.number().int().optional().describe("Number of the task it is for (first = 1)"),
  shop: entityRef("shop").optional(),
  url: webUrlSchema.optional().describe("Webshop page, only a real link you found"),
  price: z.number().min(0).max(100_000).optional().describe("Euros per unit: a real price or your estimate"),
  note: z.string().trim().max(200).optional(),
});

export const planInput = z.object({
  project: entityRef("project", "Existing project to add the tasks and materials to; leave out to create a new one").optional(),
  name: z.string().trim().min(1).max(80).optional().describe("Name of the new project"),
  budget: z.number().min(0).max(1_000_000).optional().describe("Budget in euros (new project)"),
  start: optionalDateSchema("Start YYYY-MM-DD (new project)"),
  end: optionalDateSchema("Deadline YYYY-MM-DD (new project)"),
  places: z.array(entityRef("place")).max(10).optional().describe("Rooms or zones (new project)"),
  notes: z.string().trim().max(1000).optional().describe("Scope, choices, open questions"),
  contact: entityRef("contact", "Contractor or supplier from the contacts, e.g. 'Peeters' or 'de aannemer' (not a contact yet: its name in notes)").optional(),
  role: z.string().trim().max(60).optional().describe("The contact's role on the project, e.g. aannemer (default: their trade)"),
  tasks: z.array(taskSchema).max(MAX_PLAN_TASKS).default([]).describe("In order; who, room, due date, what each waits for"),
  materials: z.array(materialSchema).max(MAX_PLAN_MATERIALS).default([]),
});
export type PlanInput = z.output<typeof planInput>;

// ── Checks ──────────────────────────────────────────────────────────────────────────────────────────

/** The fields the checks look at (resolved entities don't matter here). */
export type PlanShape = {
  project?: unknown;
  name?: string;
  budget?: number;
  start?: string;
  end?: string;
  places?: unknown[];
  tasks: { title: string; due?: string; waitsFor?: number[] }[];
  materials: { name: string; task?: number }[];
};

const isRealDate = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Task numbers (1-based) that are part of a "waits for" loop, or [] when there is none. */
export function waitsForCycle(tasks: { waitsFor?: number[] }[]): number[] {
  const waits = tasks.map((task) => [...new Set(task.waitsFor ?? [])].filter((n) => n >= 1 && n <= tasks.length).map((n) => n - 1));
  // Kahn: repeatedly take tasks that wait for nothing left; whatever remains is in (or behind) a loop.
  const remaining = waits.map((list) => list.length);
  const waitedOnBy = tasks.map(() => [] as number[]);
  waits.forEach((list, index) => list.forEach((other) => waitedOnBy[other]?.push(index)));
  const ready = remaining.flatMap((count, index) => (count === 0 ? [index] : []));
  const done = new Set<number>();
  while (ready.length) {
    const index = ready.pop() as number;
    done.add(index);
    for (const next of waitedOnBy[index] ?? []) {
      remaining[next] = (remaining[next] ?? 0) - 1;
      if (remaining[next] === 0) ready.push(next);
    }
  }
  // Keep only the tasks on a loop, not those merely waiting behind one: a task is on a loop when it can reach itself.
  const left = tasks.map((_, index) => index).filter((index) => !done.has(index));
  const reaches = (from: number, target: number) => {
    const seen = new Set<number>();
    const stack = [...(waits[from] ?? [])];
    while (stack.length) {
      const current = stack.pop() as number;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(waits[current] ?? []));
    }
    return false;
  };
  return left.filter((index) => reaches(index, index)).map((index) => index + 1);
}

export type PlanCheck = { errors: string[]; warnings: [en: string, nl: string][] };

/**
 * What would make the plan fail (errors: the call is refused with these, so the model fixes them) and what the
 * person should look at (warnings: shown on the card). `today` is YYYY-MM-DD in the household's time zone.
 */
export function checkPlan(input: PlanShape, today: string): PlanCheck {
  const errors: string[] = [];
  const warnings: [string, string][] = [];
  const count = input.tasks.length;

  if (!input.project && !input.name) errors.push("A new project needs a name (or name an existing project).");
  if (input.project && (input.budget !== undefined || input.start || input.end || input.places?.length)) {
    errors.push("Adding to an existing project only adds tasks and materials: leave out budget, start, end and places (change those with projects_save).");
  }
  if (count === 0 && input.materials.length === 0) errors.push("A plan needs at least one task or material.");

  for (const [label, value] of [["start", input.start], ["end", input.end], ...input.tasks.map((task, index) => [`task ${index + 1} due`, task.due])] as const) {
    if (value && !isRealDate(value)) errors.push(`${label}: ${value} is not a real date.`);
  }
  if (input.start && input.end && input.end < input.start) errors.push("The end date is before the start date.");
  const far = addDays(today, 3650);
  if (input.end && input.end > far) errors.push("The end date is more than 10 years away.");

  input.tasks.forEach((task, index) => {
    const n = index + 1;
    for (const other of task.waitsFor ?? []) {
      if (other === n) errors.push(`Task ${n} can't wait for itself.`);
      else if (other < 1 || other > count) errors.push(`Task ${n} waits for task ${other}, but there are ${count} tasks (first = 1).`);
    }
    if (!task.due) return;
    if (task.due < today) errors.push(`Task ${n} (${task.title}) is due ${task.due}, in the past.`);
    else if (task.due > far) errors.push(`Task ${n} (${task.title}) is due more than 10 years from now.`);
    if (input.end && task.due > input.end) warnings.push([`“${task.title}” is due after the deadline.`, `“${task.title}” valt na de deadline.`]);
    if (input.start && task.due < input.start) warnings.push([`“${task.title}” is due before the start.`, `“${task.title}” valt voor de start.`]);
    for (const other of task.waitsFor ?? []) {
      const before = input.tasks[other - 1];
      if (before?.due && before.due > task.due) {
        warnings.push([`“${task.title}” is due before “${before.title}”, which it waits for.`, `“${task.title}” valt voor “${before.title}”, waar het op wacht.`]);
      }
    }
  });
  const loop = waitsForCycle(input.tasks);
  if (loop.length) errors.push(`Tasks ${loop.join(", ")} wait for each other in a loop; break it.`);

  input.materials.forEach((material) => {
    if (material.task !== undefined && (material.task < 1 || material.task > count)) {
      errors.push(`Material “${material.name}” is for task ${material.task}, but there are ${count} tasks (first = 1).`);
    }
  });
  return { errors: [...new Set(errors)].slice(0, 12), warnings: warnings.slice(0, 20) };
}

// ── The plan, resolved ──────────────────────────────────────────────────────────────────────────────

/** A checked plan with ids and names, ready for the card and for applying. */
export type PlanDraft = {
  project: {
    /** Set when adding to an existing project. */
    existingId: string | null;
    name: string;
    color: string;
    budgetCents: number | null;
    usedCents: number;
    start: string | null;
    end: string | null;
    places: { id: string; name: string }[];
    notes: string | null;
    /** Contractor or supplier to link to the project with a role (contacts feature). */
    contact: { id: string; name: string; role: string | null } | null;
    /** The contact is already linked to the existing project (nothing to add). */
    contactLinked: boolean;
    /** The existing project's description (to append the notes to). */
    description: string | null;
  };
  tasks: {
    title: string;
    place: { id: string; name: string } | null;
    who: { id: string; name: string }[];
    due: string | null;
    waitsFor: number[];
    minutes: number | null;
    checklist: string[];
    notes: string | null;
  }[];
  materials: {
    name: string;
    quantity: number;
    unit: string | null;
    task: number | null;
    shop: { id: string; name: string } | null;
    url: string | null;
    priceCents: number | null;
    note: string | null;
  }[];
};

/** An existing project's description with the plan's notes added, or null when there is nothing to add. */
export function descriptionWithNotes(draft: PlanDraft["project"]): string | null {
  if (!draft.notes || (draft.description ?? "").includes(draft.notes)) return null;
  return [draft.description, draft.notes].filter(Boolean).join("\n\n").slice(0, 2000);
}

/** The card's data (src/features/projects/types/project-plan.ts). */
export function planPreviewData(draft: PlanDraft, warnings: string[]): ProjectPlanData {
  return {
    project: {
      name: draft.project.name,
      existing: draft.project.existingId !== null,
      budgetCents: draft.project.budgetCents,
      usedCents: draft.project.usedCents,
      start: draft.project.start,
      end: draft.project.end,
      places: draft.project.places.map((place) => place.name),
      contact: draft.project.contact ? `${draft.project.contact.name}${draft.project.contact.role ? ` (${draft.project.contact.role})` : ""}` : null,
      notes: draft.project.notes,
    },
    tasks: draft.tasks.map((task) => ({
      title: task.title,
      place: task.place?.name ?? null,
      who: task.who.map((person) => person.name),
      due: task.due,
      waitsFor: task.waitsFor,
      hours: task.minutes === null ? null : Math.round((task.minutes / 60) * 100) / 100,
      checklist: task.checklist.length,
    })),
    materials: draft.materials.map((material) => ({
      name: material.name,
      quantity: material.quantity,
      unit: material.unit,
      task: material.task,
      shop: material.shop?.name ?? null,
      url: material.url,
      priceCents: material.priceCents,
    })),
    warnings,
  };
}

/** A contact's trade from its resolver data (contacts skill: `ContactRefData`), as the default role. */
const tradeOf = (data: unknown): string | null => {
  const trade = data && typeof data === "object" && "trade" in data ? (data as { trade?: unknown }).trade : null;
  return typeof trade === "string" && trade.trim() ? trade.trim().slice(0, 60) : null;
};

/** Builds a draft from checked, resolved input and what the project already is (when adding to one). */
export function draftOf(
  input: PlanInput,
  existing: {
    id: string;
    name: string;
    color: string;
    budgetCents: number | null;
    usedCents: number;
    start: string | null;
    end: string | null;
    places: { id: string; name: string }[];
    description: string | null;
    /** Contact ids already linked to it. */
    contactIds?: string[];
  } | null,
  color: string,
): PlanDraft {
  const places = existing ? existing.places : (input.places ?? []).map((place) => ({ id: place.id, name: place.name }));
  // A task without a room happens in the project's room when it has exactly one.
  const onlyPlace = places.length === 1 ? places[0] ?? null : null;
  return {
    project: {
      existingId: existing?.id ?? null,
      name: existing?.name ?? input.name ?? "",
      color: existing?.color ?? color,
      budgetCents: existing ? existing.budgetCents : input.budget ? Math.round(input.budget * 100) : null,
      usedCents: existing?.usedCents ?? 0,
      start: existing ? existing.start : (input.start ?? null),
      end: existing ? existing.end : (input.end ?? null),
      places,
      notes: input.notes || null,
      contact: input.contact ? { id: input.contact.id, name: input.contact.name, role: input.role || tradeOf(input.contact.data) } : null,
      contactLinked: Boolean(input.contact && existing?.contactIds?.includes(input.contact.id)),
      description: existing?.description ?? null,
    },
    tasks: input.tasks.map((task) => ({
      title: task.title,
      place: task.place ? { id: task.place.id, name: task.place.name } : onlyPlace,
      who: [...new Map((task.who ?? []).map((person) => [person.id, { id: person.id, name: person.name }])).values()],
      due: task.due ?? null,
      waitsFor: [...new Set(task.waitsFor ?? [])],
      minutes: task.hours ? Math.min(10_080, Math.max(1, Math.round(task.hours * 60))) : null,
      checklist: task.checklist ?? [],
      notes: task.notes || null,
    })),
    materials: input.materials.map((material) => ({
      name: material.name,
      quantity: material.qty ?? 1,
      unit: material.unit || null,
      task: material.task ?? null,
      shop: material.shop ? { id: material.shop.id, name: material.shop.name } : null,
      url: material.url ?? null,
      priceCents: material.price === undefined ? null : Math.round(material.price * 100),
      note: material.note || null,
    })),
  };
}

// ── Applying ────────────────────────────────────────────────────────────────────────────────────────

/** The service calls a plan needs (the real ones in tools.ts; fakes in the tests). */
export type PlanOps = {
  createProject: (input: ProjectInput) => Promise<{ id: string; name: string }>;
  setProjectDescription: (projectId: string, description: string) => Promise<void>;
  linkContact: (projectId: string, contactId: string, role: string | null) => Promise<void>;
  unlinkContact: (projectId: string, contactId: string) => Promise<void>;
  createTask: (input: TaskInput) => Promise<{ id: string; title: string; dueDate: string | null; assigneeIds: string[] }>;
  /** `taskId` waits for `otherTaskId`. */
  linkTasks: (taskId: string, otherTaskId: string) => Promise<void>;
  createItem: (input: ShoppingItemCreateInput) => Promise<{ id: string }>;
  deleteItem: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
};

export type PlanResult = {
  projectId: string;
  projectName: string;
  tasks: { id: string; title: string; dueDate: string | null; assigneeIds: string[] }[];
  items: string[];
};

/** Thrown when a plan failed halfway; `undone` says whether everything created so far was removed again. */
export class PlanApplyError extends Error {
  constructor(
    readonly failure: unknown,
    readonly undone: boolean,
    readonly step: string,
  ) {
    super(`${step} failed: ${failure instanceof Error ? failure.message : String(failure)}`);
  }
}

/**
 * Creates the project (unless adding to one), the tasks with their links, and the materials as shopping items
 * of their task and the project, as the app's materials panels do. When any step fails, everything created so
 * far is deleted again (newest first) and a `PlanApplyError` says what failed: never half a plan.
 */
export async function applyPlan(draft: PlanDraft, ops: PlanOps): Promise<PlanResult> {
  const created: Created = { project: null, tasks: [], items: [], contactLink: null };
  let step = "Creating the project";
  try {
    const projectId = draft.project.existingId ?? null;
    let projectName = draft.project.name;
    if (!projectId) {
      const project = await ops.createProject({
        name: draft.project.name,
        icon: null,
        color: draft.project.color,
        tag: null,
        description: draft.project.notes,
        startDate: draft.project.start,
        endDate: draft.project.end,
        budgetCents: draft.project.budgetCents,
        status: "planned",
        placeIds: draft.project.places.map((place) => place.id),
      });
      created.project = project.id;
      projectName = project.name;
    }
    const id = (projectId ?? created.project) as string;

    for (const [index, task] of draft.tasks.entries()) {
      step = `Creating task ${index + 1} (${task.title})`;
      created.tasks.push(
        await ops.createTask({
          title: task.title,
          type: "todo",
          notes: task.notes,
          placeId: task.place?.id ?? null,
          assigneeIds: task.who.map((person) => person.id),
          dueDate: task.due,
          priority: "normal",
          estimatedMinutes: task.minutes,
          rrule: null,
          rotateAssignees: false,
          checklist: task.checklist.map((label) => ({ label, done: false })),
          projectId: id,
        }),
      );
    }
    for (const [index, task] of draft.tasks.entries()) {
      for (const other of task.waitsFor) {
        step = `Linking task ${index + 1} to task ${other}`;
        const from = created.tasks[index];
        const to = created.tasks[other - 1];
        if (from && to) await ops.linkTasks(from.id, to.id);
      }
    }
    for (const [index, material] of draft.materials.entries()) {
      step = `Adding material ${index + 1} (${material.name})`;
      const task = material.task === null ? null : created.tasks[material.task - 1];
      const place = material.task === null ? null : (draft.tasks[material.task - 1]?.place ?? null);
      const item = await ops.createItem({
        name: material.name,
        quantity: material.quantity,
        unit: material.unit,
        shopId: material.shop?.id ?? null,
        url: material.url,
        note: material.note,
        priceCents: material.priceCents,
        source: "task",
        taskId: task?.id ?? null,
        projectId: id,
        placeId: place?.id ?? null,
      });
      created.items.push(item.id);
    }
    const { contact } = draft.project;
    if (contact && !draft.project.contactLinked) {
      step = `Linking ${contact.name} to the project`;
      await ops.linkContact(id, contact.id, contact.role);
      // Deleting a new project removes its links; an existing project's link is removed on its own.
      if (projectId) created.contactLink = { projectId, contactId: contact.id };
    }
    // Last: the only change to what an existing project already had (its notes grow).
    const description = projectId ? descriptionWithNotes(draft.project) : null;
    if (projectId && description) {
      step = "Adding the notes to the project";
      await ops.setProjectDescription(projectId, description);
    }
    return { projectId: id, projectName, tasks: created.tasks, items: created.items };
  } catch (error) {
    throw new PlanApplyError(error, await undo(created, ops), step);
  }
}

type Created = {
  project: string | null;
  tasks: PlanResult["tasks"];
  items: string[];
  contactLink: { projectId: string; contactId: string } | null;
};

/** Deletes what a failed plan created, newest first. Returns whether all of it is gone. */
async function undo(created: Created, ops: PlanOps): Promise<boolean> {
  let ok = true;
  const attempt = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      ok = false;
      console.warn("[assistant] projects.plan: undo step failed", error);
    }
  };
  const link = created.contactLink;
  if (link) await attempt(() => ops.unlinkContact(link.projectId, link.contactId));
  for (const id of [...created.items].reverse()) await attempt(() => ops.deleteItem(id));
  for (const task of [...created.tasks].reverse()) await attempt(() => ops.deleteTask(task.id));
  if (created.project) await attempt(() => ops.deleteProject(created.project as string));
  return ok;
}

/** "Created Badkamer renovatie: 9 tasks, 23 materials, budget € 8.500,00." */
export function resultLine(draft: PlanDraft, result: PlanResult, money: (cents: number | null) => string | null): string {
  const parts = [
    `${result.tasks.length} task${result.tasks.length === 1 ? "" : "s"}`,
    `${result.items.length} material${result.items.length === 1 ? "" : "s"}`,
    !draft.project.existingId && draft.project.budgetCents !== null ? `budget ${money(draft.project.budgetCents)}` : null,
  ].filter(Boolean);
  return draft.project.existingId ? `Added ${parts.join(", ")} to ${result.projectName}.` : `Created ${result.projectName}: ${parts.join(", ")}.`;
}

/** The card's one-line summary, in the person's language. */
export function describePlan(locale: "en" | "nl", input: Pick<PlanInput, "tasks" | "materials" | "name"> & { project?: { name: string } }): string {
  const tasks = input.tasks.length;
  const materials = input.materials.length;
  const en = `${tasks} task${tasks === 1 ? "" : "s"} and ${materials} material${materials === 1 ? "" : "s"}`;
  const nl = `${tasks} ${tasks === 1 ? "taak" : "taken"} en ${materials} ${materials === 1 ? "materiaal" : "materialen"}`;
  return input.project
    ? say(locale, `Add ${en} to ${input.project.name}`, `${nl} toevoegen aan ${input.project.name}`)
    : say(locale, `Create the project ${input.name ?? ""} with ${en}`, `Project ${input.name ?? ""} aanmaken met ${nl}`);
}
