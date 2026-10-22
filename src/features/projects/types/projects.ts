import { z } from "zod";
import { hexColorSchema, idSchema, isoDateSchema } from "@/types/common";
import { projectPath, type ProjectRef } from "@/types/projects";
import type { ProjectBudget } from "./project-budget";

/*
 * Projects: open-ended budget pots (a room renovation, a holiday, a family trip, a Christmas budget…). Tasks,
 * expenses (one-off and recurring) and shopping items (materials) link to a project; its budget is computed
 * from them (types/project-budget.ts). See docs/PROJECTS.md.
 */

export { projectPath, type ProjectRef };

// ── Enumerations ────────────────────────────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = ["planned", "active", "done", "cancelled"] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** Planned and active projects are "running"; the list shows them by default. */
export const isRunning = (status: ProjectStatus) => status === "planned" || status === "active";

/** Icons a project can have (rendered by `ProjectIcon`). */
export const PROJECT_ICONS = [
  "hammer",
  "paint",
  "home",
  "sofa",
  "bath",
  "garden",
  "car",
  "plane",
  "holiday",
  "tent",
  "gift",
  "christmas",
  "party",
  "heart",
  "graduation",
  "folder",
] as const;
export const projectIconSchema = z.enum(PROJECT_ICONS);
export type ProjectIcon = z.infer<typeof projectIconSchema>;

/** A form or stored value as a known icon; anything else is the folder. */
export const toProjectIcon = (value: unknown): ProjectIcon =>
  (PROJECT_ICONS as readonly string[]).includes(String(value)) ? (value as ProjectIcon) : "folder";

/** Tags offered as suggestions; the tag itself is free text (stored as typed). Labels: `projects:tags.<key>`. */
export const PROJECT_TAG_SUGGESTIONS = ["renovation", "holiday", "trip", "christmas", "party", "car", "garden", "gifts"] as const;

/** Colour palette of the form. */
export const PROJECT_COLORS = ["#124734", "#3b82b6", "#7c5cc4", "#c2508a", "#d4573b", "#d9912b", "#5f7d3a", "#0f766e"] as const;

/** Largest budget: € 1 000 000. */
export const MAX_BUDGET_CENTS = 100_000_000;

// ── Input ───────────────────────────────────────────────────────────────────────────────────────────

/** Error codes the contract produces itself; the form translates them (`projects:errors.<code>`). */
export const PROJECT_ERROR_CODES = ["endBeforeStart", "unknownPlace"] as const;

const projectFields = {
  name: z.string().trim().min(1).max(80),
  icon: projectIconSchema.optional().nullable(),
  color: hexColorSchema,
  tag: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  startDate: isoDateSchema.optional().nullable(),
  endDate: isoDateSchema.optional().nullable(),
  /** Null: no budget, only track what it costs. */
  budgetCents: z.coerce.number().int().min(0).max(MAX_BUDGET_CENTS).optional().nullable(),
  status: projectStatusSchema.default("planned"),
  placeIds: z.array(idSchema).max(20).default([]),
};

const checkDates = (value: { startDate?: string | null; endDate?: string | null }, ctx: z.RefinementCtx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "endBeforeStart" });
  }
};

/** Body of `POST /api/projects` and `PUT /api/projects/:id`. */
export const projectInputSchema = z.object(projectFields).superRefine(checkDates);
export type ProjectInput = z.infer<typeof projectInputSchema>;

/** The project form as posted: the places as one comma-separated field. */
export const projectFormSchema = z
  .object({
    ...projectFields,
    placeIds: z.preprocess(
      (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : (value ?? [])),
      projectFields.placeIds,
    ),
  })
  .superRefine(checkDates);

/** `POST /api/projects/:id/status`: start, finish, cancel or plan again. */
export const projectStatusInputSchema = z.object({ status: projectStatusSchema });
export type ProjectStatusInput = z.infer<typeof projectStatusInputSchema>;

/** What can be linked to a project from its page. */
export const PROJECT_LINK_KINDS = ["task", "expense", "recurring", "item"] as const;
export const projectLinkKindSchema = z.enum(PROJECT_LINK_KINDS);
export type ProjectLinkKind = z.infer<typeof projectLinkKindSchema>;

/** `POST /api/projects/:id/links`: link an existing task, expense, recurring expense or shopping item. */
export const projectLinkInputSchema = z.object({ kind: projectLinkKindSchema, id: idSchema });
export type ProjectLinkInput = z.infer<typeof projectLinkInputSchema>;

/**
 * `POST /api/projects/:id/purchases`: these bought materials were paid with this expense ("Log as expense"),
 * so the budget counts the expense and no longer the items.
 */
export const projectPurchaseInputSchema = z.object({
  expenseId: idSchema,
  itemIds: z.array(idSchema).min(1).max(100),
});
export type ProjectPurchaseInput = z.infer<typeof projectPurchaseInputSchema>;

/** Largest number of invoice lines read, and of new materials added from them at once. */
export const MAX_INVOICE_LINES = 60;

/**
 * `PUT /api/projects/:id/expenses/:expenseId/materials`: the materials on this invoice (expense), as a whole:
 * materials on it that aren't in `itemIds` lose the link (they stay bought). Open ones become bought
 * (`markBought`, on the expense's paid date). `prices` sets a material's price per unit to the invoice price;
 * `newItems` are invoice lines that weren't on the materials list, added as bought materials on the invoice.
 */
export const projectExpenseMaterialsInputSchema = z.object({
  itemIds: z.array(idSchema).max(100).default([]),
  prices: z
    .array(z.object({ itemId: idSchema, priceCents: z.number().int().min(0).max(MAX_BUDGET_CENTS) }))
    .max(100)
    .default([]),
  newItems: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.number().positive().max(10_000).default(1),
        /** Price per unit. */
        priceCents: z.number().int().min(0).max(MAX_BUDGET_CENTS),
      }),
    )
    .max(MAX_INVOICE_LINES)
    .default([]),
  markBought: z.boolean().default(true),
});
export type ProjectExpenseMaterialsInput = z.infer<typeof projectExpenseMaterialsInputSchema>;

/** `PUT /api/projects/:id/cover`: an image attached to the project, or null to remove the cover. */
export const projectCoverInputSchema = z.object({ fileId: idSchema.nullable() });
export type ProjectCoverInput = z.infer<typeof projectCoverInputSchema>;

/** `GET /api/projects/summary?month=YYYY-MM` */
export const projectSummaryQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });
export type ProjectSummaryQuery = z.infer<typeof projectSummaryQuerySchema>;

// ── Read models ─────────────────────────────────────────────────────────────────────────────────────

export type ProjectPlace = { id: string; name: string; kind: "room" | "zone"; color: string; icon: string | null };

/** Linked tasks: open, and closed (done or skipped). */
export type ProjectTaskCounts = { total: number; open: number; done: number };

export type Project = {
  id: string;
  name: string;
  icon: ProjectIcon | null;
  color: string;
  tag: string | null;
  description: string | null;
  /** `YYYY-MM-DD` */
  startDate: string | null;
  endDate: string | null;
  budgetCents: number | null;
  status: ProjectStatus;
  /** Image attached to the project, shown on its tile and page. */
  coverFileId: string | null;
  places: ProjectPlace[];
  budget: ProjectBudget;
  tasks: ProjectTaskCounts;
  /** ISO timestamp */
  createdAt: string;
};

/** An expense counted in the project. */
export type ProjectExpense = {
  id: string;
  payee: string;
  amountCents: number;
  /** `YYYY-MM-DD` */
  dueDate: string;
  paidOn: string | null;
  /** Set for an instance of a recurring expense. */
  recurringExpenseId: string | null;
};

/** A recurring expense linked to the project (its instances are in `expenses`). */
export type ProjectRecurringExpense = {
  id: string;
  payee: string;
  amountCents: number;
  rrule: string;
  status: "active" | "paused" | "ended";
};

/** A material: a shopping item of the project, or of one of its tasks. */
export type ProjectMaterial = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  bought: boolean;
  /** Price × quantity; null when no price is known. */
  lineCents: number | null;
  priceSource: "item" | "product" | null;
  /** On this invoice (expense), via "Log as expense" or "Link materials"; the budget counts the expense instead. */
  expenseId: string | null;
  /** Material of this task (of the project). */
  taskId: string | null;
};

/** `GET /api/projects/:id` */
export type ProjectDetail = {
  today: string;
  project: Project;
  /** Paid first by date (newest first), then unpaid soonest first. */
  expenses: ProjectExpense[];
  recurring: ProjectRecurringExpense[];
  materials: ProjectMaterial[];
  /** An invoice can be read with the household's language model ("Read invoice with AI"): the assistant is configured. */
  invoiceReader: boolean;
};

/** One line of an invoice as read: what, how many, and what it cost in total (VAT included). */
export type InvoiceLine = { description: string; quantity: number; totalCents: number };

/** A material the reading thinks is on an invoice line, with its price per unit from that line. */
export type InvoiceMatch = { itemId: string; lineIndex: number; priceCents: number; confidence: number };

/** Error codes of reading an invoice; the dialog translates them (`projects:invoice.errors.<code>`). */
export const INVOICE_READ_ERRORS = ["no_invoice", "invoice_unreadable", "reader_unavailable", "reader_failed"] as const;
export type InvoiceReadError = (typeof INVOICE_READ_ERRORS)[number];

/**
 * `POST /api/projects/:id/expenses/:expenseId/read-invoice`: the invoice's lines and which materials are on
 * them, as proposed by the language model. Nothing is changed: the person confirms in the dialog.
 */
export type ProjectInvoiceReading = {
  /** The document that was read (an attachment of the expense). */
  source: { fileId: string; name: string; kind: "pdf" | "image" };
  lines: InvoiceLine[];
  /** At most one per material and one per line, best first. */
  matches: InvoiceMatch[];
  /** Indexes of lines (with a positive total) no material matched: candidates for new materials. */
  unmatchedLines: number[];
};

/** `GET /api/projects` */
export type ProjectsOverview = { today: string; projects: Project[]; tags: string[] };

/** Unlinked things that could be added to a project (`GET /api/projects/candidates`). */
export type ProjectCandidates = {
  tasks: { id: string; title: string; dueDate: string | null }[];
  expenses: { id: string; payee: string; amountCents: number; dueDate: string; paidOn: string | null }[];
  recurring: { id: string; payee: string; amountCents: number; rrule: string }[];
};

/** One project in the money flow of a month. */
export type ProjectMonthBudget = {
  project: Pick<Project, "id" | "name" | "icon" | "color" | "status" | "budgetCents" | "startDate" | "endDate">;
  budget: ProjectBudget;
  /** Paid in the month: linked expenses paid that month and materials bought that month (not logged as an expense). */
  spentInMonthCents: number;
  /** Linked unpaid expenses due in the month. */
  dueInMonthCents: number;
};

/** `GET /api/projects/summary?month=`: running projects for the money flow page. */
export type ProjectBudgetsSummaryData = {
  /** `YYYY-MM` */
  month: string;
  projects: ProjectMonthBudget[];
  totals: { spentInMonthCents: number; dueInMonthCents: number; overBudget: number; atRisk: number };
};

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────

/** Adults and owners manage projects; children only look. Mirrors the API's role check. */
export const canManageProjects = (role: "owner" | "adult" | "child") => role !== "child";

/** Share of linked tasks that are closed, 0–1 (null without tasks). */
export const taskProgress = (tasks: ProjectTaskCounts): number | null => (tasks.total > 0 ? tasks.done / tasks.total : null);

/** Running first (active, then planned), then done and cancelled; within a group by start date, then name. */
export function compareProjects(a: Project, b: Project): number {
  const order: Record<ProjectStatus, number> = { active: 0, planned: 1, done: 2, cancelled: 3 };
  if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
  if ((a.startDate ?? "") !== (b.startDate ?? "")) {
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.status === "done" || a.status === "cancelled" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate);
  }
  return a.name.localeCompare(b.name);
}

/** The first and last day of a `YYYY-MM` month. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Whether a project runs (at least partly) in a month: no dates count as always. */
export function overlapsMonth(project: { startDate: string | null; endDate: string | null }, month: string): boolean {
  const { from, to } = monthRange(month);
  const start = project.startDate ?? "0000-01-01";
  const end = project.endDate ?? "9999-12-31";
  return start <= to && end >= from;
}
