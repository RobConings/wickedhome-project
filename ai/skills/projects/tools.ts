import { z } from "zod";
import { EXPENSE_CATEGORIES, expenseCreateInputSchema } from "@/features/expenses/types/expenses";
import type { ProjectBudget } from "@/features/projects/types/project-budget";
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
  PROJECT_STATUSES,
  isRunning,
  projectInputSchema,
  type Project,
  type ProjectInvoiceReading,
  type ProjectMaterial,
} from "@/features/projects/types/projects";
import { todayIn } from "@/types/dates";
import { createExpense } from "@/api/expenses/expenses.service";
import { db } from "@/api/lib/db";
import { badRequest } from "@/api/lib/http";
import { readProjectInvoice } from "@/api/projects/project-invoices";
import { deleteItem, updateItem } from "@/api/shopping/shopping.service";
import {
  createProject,
  deleteProject,
  getProjectDetail,
  linkExpenseMaterials,
  linkToProject,
  listProjectMaterials,
  listProjects,
  recordProjectPurchase,
  unlinkFromProject,
  updateProject,
} from "@/api/projects/projects.service";
import {
  capList,
  day,
  done,
  entityRef,
  eurosSchema,
  money,
  optionalDateSchema,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  registerScreenContext,
  say,
  toCents,
  type AssistantToolContext,
} from "@ai/core/kit";
import { MONEY_ROLES, fieldsPreview } from "../expenses/shared";
// Not a tool: the language model also reads invoices for "Read invoice with AI" (src/api/projects/invoice-readers.ts).
import "./invoice-reader";

/**
 * Skill "projects": renovations, holidays, a Christmas budget… with their budget status, linked expenses,
 * tasks and materials (guide: guide.md). Budget maths is the projects feature's (`computeProjectBudget`);
 * the tools read it and call the projects and expenses services. Everyone may look, like the projects page.
 */

registerAssistantSkill({
  id: "projects",
  title: { en: "Projects", nl: "Projecten" },
  summary: "Projects with a budget (renovation, holiday, Christmas): budget status (spent, committed, left, over), linked expenses and materials, add costs, create and edit.",
  keywords: {
    nl: ["project", "projecten", "verbouwing", "verbouwen", "renovatie", "renoveren", "budget", "binnen budget", "over budget", "offerte", "materiaal", "materialen", "kerstbudget", "vakantiebudget"],
    en: ["project", "projects", "renovation", "remodel", "budget", "over budget", "material", "materials", "quote"],
  },
});

registerEntityResolver({
  type: "project",
  label: "project",
  skill: "projects",
  list: async (ctx) =>
    (await listProjects(ctx.householdId)).projects.map((project) => ({
      id: project.id,
      name: project.name,
      aliases: project.tag ? [`${project.tag} ${project.name}`] : [],
      hint: project.status,
    })),
});

/** "budget € 5.000,00: spent € 1.200,00, committed € 300,00, € 3.500,00 left (in budget)". */
function budgetText(budget: ProjectBudget): string {
  const used = `spent ${money(budget.spentCents)}, committed ${money(budget.committedCents)}`;
  const unpriced = budget.unpricedMaterials ? `; ${budget.unpricedMaterials} materials without price` : "";
  if (budget.budgetCents === null) return `no budget; ${used}${unpriced}`;
  const state =
    budget.status === "over_budget"
      ? `${money(budget.overByCents)} over budget`
      : `${money(budget.remainingCents)} left (${budget.status === "at_risk" ? "at risk, above 90 %" : "in budget"})`;
  return `budget ${money(budget.budgetCents)}: ${used}, ${state}${unpriced}`;
}

function projectSummary(project: Project) {
  return {
    name: project.name,
    status: project.status,
    tag: project.tag,
    dates: project.startDate || project.endDate ? `${day(project.startDate) ?? "…"} – ${day(project.endDate) ?? "…"}` : null,
    budget: budgetText(project.budget),
    tasks: project.tasks.total ? `${project.tasks.done}/${project.tasks.total} done` : null,
    places: project.places.length ? project.places.map((place) => place.name).join(", ") : null,
  };
}

registerAssistantTool({
  name: "projects.list",
  description: "Projects with their budget status (spent, committed, left or over budget) and task progress. For 'zitten we nog binnen budget' or 'which projects are running'.",
  input: z.object({ show: z.enum(["running", "all", "done"]).default("running").describe("running = planned and active") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at the projects", nl: "Projecten bekeken" },
  run: async (ctx, input) => {
    const { projects } = await listProjects(ctx.householdId);
    const shown = projects.filter((project) => (input.show === "all" ? true : input.show === "running" ? isRunning(project.status) : !isRunning(project.status)));
    return capList(shown, 20, projectSummary);
  },
});

const materialText = (material: ProjectMaterial) =>
  `${material.name}${material.quantity !== 1 ? ` ×${material.quantity}${material.unit ? ` ${material.unit}` : ""}` : ""}: ${material.lineCents === null ? "no price" : money(material.lineCents)}, ${material.expenseId ? "logged as expense" : material.bought ? "bought" : "to buy"}`;

registerAssistantTool({
  name: "projects.details",
  description: "One project: budget breakdown, linked expenses (paid and to pay), recurring costs, materials (bought or to buy, prices), description and dates.",
  input: z.object({ project: entityRef("project") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at a project", nl: "Project bekeken" },
  run: async (ctx, input) => {
    const detail = await getProjectDetail(ctx.householdId, input.project.id);
    const { breakdown } = detail.project.budget;
    return {
      ...projectSummary(detail.project),
      description: detail.project.description,
      breakdown: `expenses paid ${money(breakdown.expensesPaidCents)}, to pay ${money(breakdown.expensesUnpaidCents)}; materials bought ${money(breakdown.materialsBoughtCents)}, to buy ${money(breakdown.materialsOpenCents)}`,
      expenses: capList(detail.expenses, 15, (expense) => `${expense.payee} ${money(expense.amountCents)} ${expense.paidOn ? `paid ${day(expense.paidOn)}` : `due ${day(expense.dueDate)}`}`),
      recurring: detail.recurring.map((item) => `${item.payee} ${money(item.amountCents)} (${item.status})`),
      materials: capList(detail.materials, 20, materialText),
    };
  },
});

// ── Create and edit ─────────────────────────────────────────────────────────────────────────────────

const saveInput = z.object({
  project: entityRef("project", "The project to change; leave out to create a new one").optional(),
  name: z.string().trim().min(1).max(80).optional(),
  budget: z.number().min(0).max(1_000_000).optional().describe("Budget in euros (0 = no budget)"),
  startDate: optionalDateSchema("Start YYYY-MM-DD"),
  endDate: optionalDateSchema("End YYYY-MM-DD"),
  status: z.enum(PROJECT_STATUSES).optional(),
  tag: z.string().trim().max(40).optional().describe("Free tag, e.g. renovation, holiday, christmas"),
  description: z.string().trim().max(2000).optional(),
  places: z.array(entityRef("place")).max(20).optional().describe("Rooms or zones it is about"),
  icon: z.enum(PROJECT_ICONS).optional(),
});
type SaveInput = z.output<typeof saveInput>;

async function projectInputOf(ctx: AssistantToolContext, input: SaveInput) {
  const budgetCents = input.budget === undefined ? undefined : input.budget > 0 ? toCents(input.budget) : null;
  if (input.project) {
    const { project } = await getProjectDetail(ctx.householdId, input.project.id);
    return {
      before: project,
      data: projectInputSchema.parse({
        name: input.name ?? project.name,
        icon: input.icon ?? project.icon,
        color: project.color,
        tag: input.tag ?? project.tag,
        description: input.description ?? project.description,
        startDate: input.startDate ?? project.startDate,
        endDate: input.endDate ?? project.endDate,
        budgetCents: budgetCents === undefined ? project.budgetCents : budgetCents,
        status: input.status ?? project.status,
        placeIds: input.places ? input.places.map((place) => place.id) : project.places.map((place) => place.id),
      }),
    };
  }
  if (!input.name) throw badRequest("A new project needs a name");
  const { projects } = await listProjects(ctx.householdId);
  return {
    before: null,
    data: projectInputSchema.parse({
      name: input.name,
      icon: input.icon ?? null,
      color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
      tag: input.tag ?? null,
      description: input.description ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      budgetCents: budgetCents ?? null,
      status: input.status ?? "planned",
      placeIds: (input.places ?? []).map((place) => place.id),
    }),
  };
}

registerAssistantTool({
  name: "projects.save",
  description: "Create just the project record (name, budget, dates, tag, rooms) or change one: rename, new budget, dates, status (planned, active, done, cancelled). Only pass what changes. A plan with tasks and materials: projects_plan.",
  input: saveInput,
  permission: "write",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Saved a project", nl: "Project bewaard" },
  describe: (ctx, input) =>
    input.project
      ? say(ctx.locale, `Change the project ${input.project.name}`, `Project ${input.project.name} wijzigen`)
      : say(ctx.locale, `Create the project ${input.name ?? ""}`, `Project ${input.name ?? ""} aanmaken`),
  preview: async (ctx, input) => {
    const { before, data } = await projectInputOf(ctx, input);
    const change = (from: string | null | undefined, to: string | null | undefined) => (before ? ((from ?? "") === (to ?? "") ? null : `${from || "–"} → ${to || "–"}`) : to);
    return fieldsPreview(ctx.locale, before ? [`Change ${before.name}`, `${before.name} wijzigen`] : ["New project", "Nieuw project"], [
      [["Name", "Naam"], change(before?.name, data.name)],
      [["Budget", "Budget"], change(money(before?.budgetCents), money(data.budgetCents))],
      [["Status", "Status"], change(before?.status, data.status)],
      [["Start", "Start"], change(day(before?.startDate, ctx.locale), day(data.startDate, ctx.locale))],
      [["End", "Einde"], change(day(before?.endDate, ctx.locale), day(data.endDate, ctx.locale))],
      [["Tag", "Label"], change(before?.tag, data.tag)],
      [["Rooms", "Ruimtes"], input.places ? input.places.map((place) => place.name).join(", ") : null],
    ]);
  },
  run: async (ctx, input) => {
    const { before, data } = await projectInputOf(ctx, input);
    const project = before ? await updateProject(ctx.householdId, before.id, data) : await createProject(ctx.householdId, data);
    return done(`${before ? "Changed" : "Created"} the project ${project.name} (${budgetText(project.budget)}).`, { id: project.id });
  },
});

// ── Links ───────────────────────────────────────────────────────────────────────────────────────────

const linkInput = z.object({
  project: entityRef("project"),
  expense: entityRef("expense", "A bill or logged expense by payee (add a date for another one)").optional(),
  recurring: entityRef("recurring_expense", "A recurring expense (with all its payments)").optional(),
  task: entityRef("task").optional(),
  unlink: z.boolean().optional().describe("Remove the link instead"),
});

function linkTarget(input: z.output<typeof linkInput>): { kind: "expense" | "recurring" | "task"; id: string; name: string } {
  const target = input.expense ? { kind: "expense" as const, ...input.expense } : input.recurring ? { kind: "recurring" as const, ...input.recurring } : input.task ? { kind: "task" as const, ...input.task } : null;
  if (!target) throw badRequest("Name the expense, recurring expense or task to link");
  return { kind: target.kind, id: target.id, name: target.name };
}

registerAssistantTool({
  name: "projects.link",
  description: "Link an existing expense, recurring expense or task to a project so it counts for its budget, or unlink it.",
  input: linkInput,
  permission: "write",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Changed a project link", nl: "Projectkoppeling gewijzigd" },
  describe: (ctx, input) => {
    const target = linkTarget(input);
    return input.unlink
      ? say(ctx.locale, `Unlink ${target.name} from ${input.project.name}`, `${target.name} loskoppelen van ${input.project.name}`)
      : say(ctx.locale, `Link ${target.name} to ${input.project.name}`, `${target.name} koppelen aan ${input.project.name}`);
  },
  run: async (ctx, input) => {
    const target = linkTarget(input);
    if (input.unlink) await unlinkFromProject(ctx.householdId, input.project.id, { kind: target.kind, id: target.id });
    else await linkToProject(ctx.householdId, input.project.id, { kind: target.kind, id: target.id });
    const { project } = await getProjectDetail(ctx.householdId, input.project.id);
    return done(`${input.unlink ? "Unlinked" : "Linked"} ${target.name} ${input.unlink ? "from" : "to"} ${project.name}: ${budgetText(project.budget)}.`);
  },
});

// ── Project materials ───────────────────────────────────────────────────────────────────────────────

const materialChangeInput = z.object({
  project: entityRef("project"),
  material: z.string().trim().min(1).max(120).describe("Exact material name within the project"),
  action: z.enum(["delete", "unlink", "bought", "open"]).describe("Delete the shopping item, unlink from this project, or change its purchase status"),
});

async function matchingProjectMaterial(ctx: AssistantToolContext, input: z.output<typeof materialChangeInput>) {
  const materials = await listProjectMaterials(ctx.householdId, input.project.id);
  const matches = materials.filter((item) => item.name.trim().toLocaleLowerCase() === input.material.toLocaleLowerCase());
  if (matches.length !== 1) {
    throw badRequest(`Expected exactly one project material named "${input.material}", found ${matches.length}. Available: ${materials.map((item) => item.name).join(", ") || "none"}`);
  }
  return matches[0]!;
}

registerAssistantTool({
  name: "projects.change_material",
  description: "Delete an unwanted project material, unlink it from the project without deleting the shopping item, or mark it bought/open. Requires an exact unique material name; never deletes the whole project.",
  input: materialChangeInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Changed a project material", nl: "Projectmateriaal gewijzigd" },
  describe: (ctx, input) => say(ctx.locale,
    `${input.action} material ${input.material} in ${input.project.name}`,
    `Materiaal ${input.material} in ${input.project.name}: ${input.action}`),
  preview: async (ctx, input) => {
    const material = await matchingProjectMaterial(ctx, input);
    return { kind: "list", title: say(ctx.locale, "Project material change", "Projectmateriaal wijzigen"), data: {
      items: [{ label: material.name, detail: `${input.action} · ${materialText(material)}`, tone: input.action === "delete" || input.action === "unlink" ? "remove" as const : "change" as const }],
    } };
  },
  run: async (ctx, input) => {
    const material = await matchingProjectMaterial(ctx, input);
    if (input.action === "delete") await deleteItem(ctx.user, material.id);
    else if (input.action === "unlink") await unlinkFromProject(ctx.householdId, input.project.id, { kind: "item", id: material.id });
    else await updateItem(ctx.user, material.id, { status: input.action === "bought" ? "bought" : "open" });
    return done(`Material ${material.name}: ${input.action} in project ${input.project.name}.`);
  },
});

// ── Costs ───────────────────────────────────────────────────────────────────────────────────────────

const costInput = z.object({
  project: entityRef("project"),
  payee: z.string().trim().min(1).max(64).describe("Shop or supplier, e.g. 'Brico'"),
  amount: eurosSchema,
  date: optionalDateSchema("Paid on (or due on when not paid yet), YYYY-MM-DD (default today)"),
  paid: z.boolean().default(true).describe("false: a bill or quote still to pay"),
  category: z.enum(EXPENSE_CATEGORIES).default("household"),
  paymentMethod: z.enum(["card", "cash", "wire_transfer", "other"]).default("card"),
  paidBy: z.enum(["joint", "me"]).default("joint"),
  materials: z.array(z.string().trim().min(1).max(80)).max(30).optional().describe("Bought materials of the project this purchase paid for"),
});
type CostInput = z.output<typeof costInput>;

/** The project's bought materials (not yet logged as an expense) the names point at. */
async function coveredMaterials(ctx: AssistantToolContext, input: CostInput): Promise<ProjectMaterial[]> {
  if (!input.materials?.length) return [];
  const { materials } = await getProjectDetail(ctx.householdId, input.project.id);
  const open = materials.filter((material) => material.bought && !material.expenseId);
  return input.materials.map((name) => {
    const wanted = name.toLowerCase();
    const hits = open.filter((material) => material.name.toLowerCase() === wanted);
    const loose = hits.length ? hits : open.filter((material) => material.name.toLowerCase().includes(wanted));
    if (loose.length !== 1) {
      throw badRequest(`${loose.length ? "Several" : "No"} bought materials match "${name}". Bought, not yet logged: ${open.map((material) => material.name).join(", ") || "none"}`);
    }
    return loose[0] as ProjectMaterial;
  });
}

registerAssistantTool({
  name: "projects.add_cost",
  description: "Record a cost for a project: a purchase already paid (default) or a bill still to pay; it counts for the project's budget. Optionally the bought materials it paid for.",
  input: costInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Recorded a project cost", nl: "Projectkost genoteerd" },
  describe: (ctx, input) =>
    say(ctx.locale, `Record ${money(toCents(input.amount))} at ${input.payee} for ${input.project.name}`, `${money(toCents(input.amount))} bij ${input.payee} noteren voor ${input.project.name}`),
  preview: async (ctx, input) => {
    const materials = await coveredMaterials(ctx, input);
    const date = day(input.date ?? todayIn(), ctx.locale);
    return fieldsPreview(ctx.locale, ["Project cost", "Projectkost"], [
      [["Amount", "Bedrag"], money(toCents(input.amount))],
      [["Payee", "Begunstigde"], input.payee],
      [["Project", "Project"], input.project.name],
      [[input.paid ? "Paid on" : "Due", input.paid ? "Betaald op" : "Vervaldag"], date],
      [["Paid by", "Betaald door"], input.paidBy === "me" ? ctx.user.name : say(ctx.locale, "Joint account", "Gemeenschappelijke rekening")],
      [["Materials", "Materialen"], materials.map((material) => material.name).join(", ")],
    ]);
  },
  run: async (ctx, input) => {
    const materials = await coveredMaterials(ctx, input);
    if (input.paidBy === "me" && !ctx.user.habitantId) throw badRequest("This account has no habitant to pay personally");
    const date = input.date ?? todayIn();
    const expense = await createExpense(
      ctx.householdId,
      expenseCreateInputSchema.parse({
        payee: input.payee,
        amountCents: toCents(input.amount),
        category: input.category,
        dueDate: date,
        paidOn: input.paid ? date : null,
        paymentMethod: input.paymentMethod,
        payerType: input.paidBy === "me" ? "person" : "joint",
        payerHabitantId: input.paidBy === "me" ? ctx.user.habitantId : null,
        projectId: input.project.id,
      }),
    );
    if (materials.length) await recordProjectPurchase(ctx.householdId, input.project.id, { expenseId: expense.id, itemIds: materials.map((material) => material.id) });
    const { project } = await getProjectDetail(ctx.householdId, input.project.id);
    return done(`Recorded ${money(expense.amountCents)} at ${expense.payee} for ${project.name}: ${budgetText(project.budget)}.`, { id: expense.id });
  },
});

// ── Invoice → materials ─────────────────────────────────────────────────────────────────────────────

/** Matches below this confidence are shown in the dialog but never applied by the tool. */
const SURE_MATCH = 0.5;
const READING_TTL_MS = 10 * 60_000;
/** The card's preview reads the invoice (a slow model call); Confirm applies that same reading. */
const readings = new Map<string, { at: number; reading: ProjectInvoiceReading }>();

const invoiceInput = z.object({
  project: entityRef("project"),
  expense: entityRef("expense", "The invoice: an expense by payee, e.g. 'Toppy' (add a date for another one)"),
  addUnmatched: z.boolean().default(false).describe("Also add invoice lines that aren't materials yet, as bought materials"),
});
type InvoiceInput = z.output<typeof invoiceInput>;

async function invoiceReading(ctx: AssistantToolContext, input: InvoiceInput): Promise<ProjectInvoiceReading> {
  const key = `${ctx.householdId}:${input.project.id}:${input.expense.id}`;
  const cached = readings.get(key);
  if (cached && Date.now() - cached.at < READING_TTL_MS) return cached.reading;
  const reading = await readProjectInvoice(ctx.householdId, input.project.id, input.expense.id, ctx.signal);
  readings.set(key, { at: Date.now(), reading });
  return reading;
}

registerAssistantTool({
  name: "projects.link_invoice",
  description: "Read the invoice (PDF or photo attached to an expense) and link the project's materials on it: they become bought at the invoice price and count once, as the expense. For 'koppel de factuur van Toppy aan het materiaal'.",
  input: invoiceInput,
  permission: "write",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Linked materials to an invoice", nl: "Materiaal aan factuur gekoppeld" },
  describe: (ctx, input) =>
    say(ctx.locale, `Link the materials of ${input.project.name} on the invoice of ${input.expense.name}`, `Materiaal van ${input.project.name} koppelen aan de factuur van ${input.expense.name}`),
  preview: async (ctx, input) => {
    const reading = await invoiceReading(ctx, input);
    const materials = new Map((await listProjectMaterials(ctx.householdId, input.project.id)).map((material) => [material.id, material]));
    const sure = reading.matches.filter((match) => match.confidence >= SURE_MATCH);
    const extra = input.addUnmatched ? reading.unmatchedLines : [];
    return {
      kind: "list",
      title: say(ctx.locale, `${sure.length + extra.length} materials on the invoice`, `${sure.length + extra.length} materialen op de factuur`),
      data: {
        items: [
          ...sure.map((match) => ({
            label: materials.get(match.itemId)?.name ?? "?",
            detail: `${money(reading.lines[match.lineIndex]?.totalCents ?? 0)} · ${reading.lines[match.lineIndex]?.description ?? ""}`,
            tone: "change" as const,
          })),
          ...extra.map((index) => ({ label: reading.lines[index]?.description ?? "", detail: `${money(reading.lines[index]?.totalCents ?? 0)} · ${say(ctx.locale, "new", "nieuw")}`, tone: "add" as const })),
        ],
      },
    };
  },
  run: async (ctx, input) => {
    const reading = await invoiceReading(ctx, input);
    const materials = await listProjectMaterials(ctx.householdId, input.project.id);
    const sure = reading.matches.filter((match) => match.confidence >= SURE_MATCH);
    const alreadyOn = materials.filter((material) => material.expenseId === input.expense.id).map((material) => material.id);
    const newItems = (input.addUnmatched ? reading.unmatchedLines : []).flatMap((index) => {
      const line = reading.lines[index];
      return line ? [{ name: line.description, quantity: line.quantity, priceCents: Math.round(line.totalCents / line.quantity) }] : [];
    });
    if (!sure.length && !newItems.length) throw badRequest(`No materials of ${input.project.name} were found on the invoice. Invoice lines: ${reading.lines.map((line) => line.description).join(", ")}`);
    await linkExpenseMaterials({ id: ctx.user.id, householdId: ctx.householdId, locale: ctx.locale }, input.project.id, input.expense.id, {
      itemIds: [...new Set([...alreadyOn, ...sure.map((match) => match.itemId)])],
      prices: sure.map((match) => ({ itemId: match.itemId, priceCents: match.priceCents })),
      newItems,
      markBought: true,
    });
    readings.delete(`${ctx.householdId}:${input.project.id}:${input.expense.id}`);
    const { project } = await getProjectDetail(ctx.householdId, input.project.id);
    const unmatched = input.addUnmatched ? 0 : reading.unmatchedLines.length;
    return done(
      `Linked ${sure.length + newItems.length} materials to the invoice of ${input.expense.name}${unmatched ? `; ${unmatched} invoice lines aren't materials (addUnmatched adds them)` : ""}: ${budgetText(project.budget)}.`,
    );
  },
});

registerAssistantTool({
  name: "projects.delete",
  description: "Delete a project. Its tasks, expenses and materials stay, without the link. To close a finished project use projects_save status done.",
  input: z.object({ project: entityRef("project") }),
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Deleted a project", nl: "Project verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete the project ${input.project.name} (linked items stay, unlinked)`, `Project ${input.project.name} verwijderen (gekoppelde items blijven, ontkoppeld)`),
  run: async (ctx, input) => {
    await deleteProject(ctx.householdId, input.project.id);
    return done(`Deleted the project ${input.project.name}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): a project's page and the projects overview ──

registerScreenContext({
  kind: "project",
  skills: ["projects"],
  describe: async (ctx, id) => {
    const project = id
      ? await db.project.findFirst({ where: { id, householdId: ctx.householdId }, select: { name: true, status: true, budgetCents: true } })
      : null;
    const budget = project?.budgetCents ? `, budget ${money(project.budgetCents)}` : "";
    return project && { label: project.name, summary: `project "${project.name}" (${project.status.toLowerCase()}${budget})` };
  },
});

registerScreenContext({
  kind: "projects",
  skills: ["projects"],
  describe: (ctx) => ({ label: say(ctx.locale, "Projects", "Projecten"), summary: "the projects overview (budget pots)" }),
});
