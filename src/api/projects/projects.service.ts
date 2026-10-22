import type { SessionUser } from "@/features/auth/types/auth";
import {
  budgetMaterialsOf,
  computeProjectBudget,
  materialLine,
  type BudgetExpense,
} from "@/features/projects/types/project-budget";
import {
  compareProjects,
  isRunning,
  monthRange,
  overlapsMonth,
  type Project,
  type ProjectBudgetsSummaryData,
  type ProjectCandidates,
  type ProjectCoverInput,
  type ProjectDetail,
  type ProjectExpense,
  type ProjectExpenseMaterialsInput,
  type ProjectIcon,
  type ProjectInput,
  type ProjectLinkInput,
  type ProjectMaterial,
  type ProjectMonthBudget,
  type ProjectPurchaseInput,
  type ProjectRecurringExpense,
  type ProjectsOverview,
  type ProjectStatus,
  type ProjectStatusInput,
} from "@/features/projects/types/projects";
import { addDays, todayIn } from "@/types/dates";
import { forgetDocumentLinks } from "../documents/documents.service";
import { topUpRecurring } from "../expenses/expense-instances";
import { db, type Prisma, type ProjectStatus as ProjectStatusRow } from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { forgetEntity } from "../selections/selections.service";
import { createItem } from "../shopping/shopping.service";
import { availableInvoiceReader } from "./invoice-readers";

/*
 * Projects own only their own rows (projects, project_places). What is linked to a project lives in other
 * features' tables with a nullable `projectId`: tasks, expenses (bills), recurring expenses (bill_series; their
 * instances copy it) and shopping items. Materials of a task in a project count for the project too. Budgets
 * are computed on read (types/project-budget.ts); nothing is stored.
 */

const today = () => todayIn();
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);
const optionalDate = (date: Date | null) => (date ? fromDate(date) : null);
const toStatus = (status: ProjectStatusRow) => status.toLowerCase() as ProjectStatus;
const fromStatus = (status: ProjectStatus) => status.toUpperCase() as ProjectStatusRow;

const projectInclude = {
  places: { include: { place: { select: { id: true, name: true, kind: true, color: true, icon: true } } } },
} as const satisfies Prisma.ProjectInclude;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

const expenseSelect = {
  id: true,
  projectId: true,
  payee: true,
  amountCents: true,
  dueDate: true,
  paidOn: true,
  recurringExpenseId: true,
} as const satisfies Prisma.ExpenseSelect;
type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;

const itemSelect = {
  id: true,
  name: true,
  quantity: true,
  unit: true,
  status: true,
  priceCents: true,
  shopId: true,
  expenseId: true,
  taskId: true,
  projectId: true,
  boughtAt: true,
  product: { select: { shopLinks: { select: { shopId: true, priceCents: true } } } },
} as const satisfies Prisma.ShoppingItemSelect;
type ItemRow = Prisma.ShoppingItemGetPayload<{ select: typeof itemSelect }>;

/** Everything linked to a set of projects, loaded in a few queries. */
type Linked = {
  expenses: Map<string, ExpenseRow[]>;
  materials: Map<string, (ProjectMaterial & { boughtAt: Date | null })[]>;
  tasks: Map<string, { total: number; open: number; done: number }>;
};

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function toMaterial(row: ItemRow): ProjectMaterial & { boughtAt: Date | null } {
  const quantity = row.quantity.toNumber();
  const line = materialLine({
    priceCents: row.priceCents,
    quantity,
    shopId: row.shopId,
    productPrices: row.product?.shopLinks ?? [],
  });
  return {
    id: row.id,
    name: row.name,
    quantity,
    unit: row.unit,
    bought: row.status === "BOUGHT",
    lineCents: line.lineCents,
    priceSource: line.source,
    expenseId: row.expenseId,
    taskId: row.taskId,
    boughtAt: row.boughtAt,
  };
}

async function loadLinked(householdId: string, projectIds: string[]): Promise<Linked> {
  const linked: Linked = { expenses: new Map(), materials: new Map(), tasks: new Map() };
  if (projectIds.length === 0) return linked;
  const [expenses, tasks] = await Promise.all([
    db.expense.findMany({
      where: { householdId, projectId: { in: projectIds } },
      select: expenseSelect,
      orderBy: { dueDate: "asc" },
    }),
    db.task.findMany({ where: { householdId, projectId: { in: projectIds } }, select: { id: true, projectId: true, status: true } }),
  ]);
  const taskProject = new Map(tasks.flatMap((task) => (task.projectId ? [[task.id, task.projectId] as const] : [])));
  const items = await db.shoppingItem.findMany({
    where: { householdId, OR: [{ projectId: { in: projectIds } }, { taskId: { in: [...taskProject.keys()] } }] },
    select: itemSelect,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  for (const expense of expenses) if (expense.projectId) push(linked.expenses, expense.projectId, expense);
  for (const item of items) {
    // An item's own project wins over the project of its task.
    const projectId = item.projectId ?? (item.taskId ? taskProject.get(item.taskId) : undefined);
    if (projectId) push(linked.materials, projectId, toMaterial(item));
  }
  for (const task of tasks) {
    if (!task.projectId) continue;
    const counts = linked.tasks.get(task.projectId) ?? { total: 0, open: 0, done: 0 };
    counts.total += 1;
    if (task.status === "OPEN") counts.open += 1;
    else counts.done += 1;
    linked.tasks.set(task.projectId, counts);
  }
  return linked;
}

/**
 * Expenses that count for the budget: all linked one-offs, and instances of linked recurring expenses. A
 * project with an end date doesn't count unpaid instances due after it (a subscription that runs on).
 */
function countedExpenses(row: Pick<ProjectRow, "endDate">, expenses: ExpenseRow[]): ExpenseRow[] {
  const end = row.endDate;
  return expenses.filter((expense) => expense.paidOn || !expense.recurringExpenseId || !end || expense.dueDate <= end);
}

function toProject(row: ProjectRow, linked: Linked): Project {
  const expenses = countedExpenses(row, linked.expenses.get(row.id) ?? []);
  const materials = linked.materials.get(row.id) ?? [];
  const budgetExpenses: BudgetExpense[] = expenses.map((expense) => ({ amountCents: expense.amountCents, paid: expense.paidOn !== null }));
  const budgetMaterials = budgetMaterialsOf(materials, new Set(expenses.map((expense) => expense.id)));
  return {
    id: row.id,
    name: row.name,
    icon: (row.icon as ProjectIcon | null) ?? null,
    color: row.color,
    tag: row.tag,
    description: row.description,
    startDate: optionalDate(row.startDate),
    endDate: optionalDate(row.endDate),
    budgetCents: row.budgetCents,
    status: toStatus(row.status),
    coverFileId: row.coverFileId,
    places: row.places
      .map(({ place }) => ({ id: place.id, name: place.name, kind: place.kind === "ZONE" ? ("zone" as const) : ("room" as const), color: place.color, icon: place.icon }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    budget: computeProjectBudget(row.budgetCents, budgetExpenses, budgetMaterials),
    tasks: linked.tasks.get(row.id) ?? { total: 0, open: 0, done: 0 },
    createdAt: row.createdAt.toISOString(),
  };
}

async function findOwnProject(householdId: string, id: string): Promise<ProjectRow> {
  const row = await db.project.findFirst({ where: { id, householdId }, include: projectInclude });
  if (!row) throw notFound("Project not found");
  return row;
}

async function assertOwnPlaces(householdId: string, placeIds: string[]) {
  if (placeIds.length === 0) return;
  const found = await db.place.count({ where: { householdId, id: { in: placeIds } } });
  if (found !== new Set(placeIds).size) throw badRequest("Validation failed", { placeIds: ["unknownPlace"] });
}

// ── Queries ─────────────────────────────────────────────────────────────────────────────────────────

export async function listProjects(householdId: string): Promise<ProjectsOverview> {
  const now = today();
  await topUpRecurring(householdId, now);
  const rows = await db.project.findMany({ where: { householdId }, include: projectInclude });
  const linked = await loadLinked(
    householdId,
    rows.map((row) => row.id),
  );
  const projects = rows.map((row) => toProject(row, linked)).sort(compareProjects);
  const tags = [...new Set(projects.flatMap((project) => (project.tag ? [project.tag] : [])))].sort((a, b) => a.localeCompare(b));
  return { today: now, projects, tags };
}

export async function getProjectDetail(householdId: string, id: string): Promise<ProjectDetail> {
  const now = today();
  await topUpRecurring(householdId, now);
  const row = await findOwnProject(householdId, id);
  const [linked, recurring] = await Promise.all([
    loadLinked(householdId, [id]),
    db.recurringExpense.findMany({
      where: { householdId, projectId: id },
      select: { id: true, payee: true, amountCents: true, rrule: true, status: true },
      orderBy: { payee: "asc" },
    }),
  ]);
  const expenses: ProjectExpense[] = countedExpenses(row, linked.expenses.get(id) ?? [])
    .map((expense) => ({
      id: expense.id,
      payee: expense.payee,
      amountCents: expense.amountCents,
      dueDate: fromDate(expense.dueDate),
      paidOn: optionalDate(expense.paidOn),
      recurringExpenseId: expense.recurringExpenseId,
    }))
    // Unpaid soonest first, then paid newest first.
    .sort((a, b) =>
      a.paidOn === null && b.paidOn === null
        ? a.dueDate.localeCompare(b.dueDate)
        : a.paidOn === null
          ? -1
          : b.paidOn === null
            ? 1
            : b.paidOn.localeCompare(a.paidOn),
    );
  return {
    today: now,
    project: toProject(row, linked),
    expenses,
    recurring: recurring.map(
      (item): ProjectRecurringExpense => ({
        id: item.id,
        payee: item.payee,
        amountCents: item.amountCents,
        rrule: item.rrule,
        status: item.status.toLowerCase() as ProjectRecurringExpense["status"],
      }),
    ),
    materials: (linked.materials.get(id) ?? []).map(({ boughtAt: _boughtAt, ...material }) => material),
    invoiceReader: availableInvoiceReader() !== null,
  };
}

/** The project's materials (its own shopping items and those of its tasks). */
export async function listProjectMaterials(householdId: string, id: string): Promise<ProjectMaterial[]> {
  await findOwnProject(householdId, id);
  const { materials } = await loadLinked(householdId, [id]);
  return (materials.get(id) ?? []).map(({ boughtAt: _boughtAt, ...material }) => material);
}

/** Unlinked open tasks, one-off expenses and recurring expenses that could be added to a project. */
export async function getProjectCandidates(householdId: string): Promise<ProjectCandidates> {
  const now = today();
  const [tasks, expenses, recurring] = await Promise.all([
    db.task.findMany({
      where: { householdId, projectId: null, status: "OPEN", originType: null },
      select: { id: true, title: true, dueDate: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
      take: 300,
    }),
    db.expense.findMany({
      where: { householdId, projectId: null, recurringExpenseId: null, dueDate: { gte: toDate(addDays(now, -365)) } },
      select: { id: true, payee: true, amountCents: true, dueDate: true, paidOn: true },
      orderBy: { dueDate: "desc" },
      take: 300,
    }),
    db.recurringExpense.findMany({
      where: { householdId, projectId: null, status: { not: "ENDED" } },
      select: { id: true, payee: true, amountCents: true, rrule: true },
      orderBy: { payee: "asc" },
    }),
  ]);
  return {
    tasks: tasks.map((task) => ({ id: task.id, title: task.title, dueDate: optionalDate(task.dueDate) })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      payee: expense.payee,
      amountCents: expense.amountCents,
      dueDate: fromDate(expense.dueDate),
      paidOn: optionalDate(expense.paidOn),
    })),
    recurring,
  };
}

/**
 * The money flow of a month: running projects that overlap it, plus any project with money paid or due in it.
 * Per project its whole budget, what was paid in the month and what is due in it.
 */
export async function getProjectBudgetsSummary(householdId: string, month = today().slice(0, 7)): Promise<ProjectBudgetsSummaryData> {
  const { from, to } = monthRange(month);
  const overview = await listProjects(householdId);
  const rows = await db.project.findMany({ where: { householdId }, select: { id: true, endDate: true } });
  const linked = await loadLinked(
    householdId,
    rows.map((row) => row.id),
  );
  const endById = new Map(rows.map((row) => [row.id, row]));
  const inMonth = (date: Date | null) => date !== null && fromDate(date) >= from && fromDate(date) <= to;

  const projects: ProjectMonthBudget[] = overview.projects.flatMap((project) => {
    const expenses = countedExpenses(endById.get(project.id) ?? { endDate: null }, linked.expenses.get(project.id) ?? []);
    const materials = linked.materials.get(project.id) ?? [];
    const onInvoice = new Set(expenses.map((expense) => expense.id));
    const spentInMonthCents =
      expenses.filter((expense) => inMonth(expense.paidOn)).reduce((sum, expense) => sum + expense.amountCents, 0) +
      materials
        .filter((material) => material.bought && !(material.expenseId && onInvoice.has(material.expenseId)) && material.lineCents !== null && inMonth(material.boughtAt))
        .reduce((sum, material) => sum + (material.lineCents ?? 0), 0);
    const dueInMonthCents = expenses
      .filter((expense) => expense.paidOn === null && inMonth(expense.dueDate))
      .reduce((sum, expense) => sum + expense.amountCents, 0);
    const running = isRunning(project.status) && overlapsMonth(project, month);
    if (!running && spentInMonthCents === 0 && dueInMonthCents === 0) return [];
    return [
      {
        project: {
          id: project.id,
          name: project.name,
          icon: project.icon,
          color: project.color,
          status: project.status,
          budgetCents: project.budgetCents,
          startDate: project.startDate,
          endDate: project.endDate,
        },
        budget: project.budget,
        spentInMonthCents,
        dueInMonthCents,
      },
    ];
  });

  return {
    month,
    projects,
    totals: {
      spentInMonthCents: projects.reduce((sum, item) => sum + item.spentInMonthCents, 0),
      dueInMonthCents: projects.reduce((sum, item) => sum + item.dueInMonthCents, 0),
      overBudget: projects.filter((item) => item.budget.status === "over_budget").length,
      atRisk: projects.filter((item) => item.budget.status === "at_risk").length,
    },
  };
}

// ── Mutations ───────────────────────────────────────────────────────────────────────────────────────

const fieldsOf = (input: ProjectInput) => ({
  name: input.name,
  icon: input.icon ?? null,
  color: input.color,
  tag: input.tag || null,
  description: input.description || null,
  startDate: input.startDate ? toDate(input.startDate) : null,
  endDate: input.endDate ? toDate(input.endDate) : null,
  budgetCents: input.budgetCents ?? null,
  status: fromStatus(input.status),
});

const placesCreate = (placeIds: string[]) => ({ create: [...new Set(placeIds)].map((placeId) => ({ placeId })) });

export async function createProject(householdId: string, input: ProjectInput): Promise<Project> {
  await assertOwnPlaces(householdId, input.placeIds);
  const row = await db.project.create({
    data: { householdId, ...fieldsOf(input), places: placesCreate(input.placeIds) },
    include: projectInclude,
  });
  return toProject(row, await loadLinked(householdId, [row.id]));
}

export async function updateProject(householdId: string, id: string, input: ProjectInput): Promise<Project> {
  await findOwnProject(householdId, id);
  await assertOwnPlaces(householdId, input.placeIds);
  const row = await db.$transaction(async (tx) => {
    await tx.projectPlace.deleteMany({ where: { projectId: id } });
    return tx.project.update({ where: { id }, data: { ...fieldsOf(input), places: placesCreate(input.placeIds) }, include: projectInclude });
  });
  return toProject(row, await loadLinked(householdId, [id]));
}

export async function setProjectStatus(householdId: string, id: string, input: ProjectStatusInput): Promise<Project> {
  await findOwnProject(householdId, id);
  const row = await db.project.update({ where: { id }, data: { status: fromStatus(input.status) }, include: projectInclude });
  return toProject(row, await loadLinked(householdId, [id]));
}

/** Sets an image attached to the project as its cover (or removes the cover). */
export async function setProjectCover(householdId: string, id: string, input: ProjectCoverInput): Promise<Project> {
  await findOwnProject(householdId, id);
  if (input.fileId) {
    const attached = await db.documentLink.count({
      where: { householdId, entityType: "project", entityId: id, fileId: input.fileId, file: { deletedAt: null, mimeType: { startsWith: "image/" } } },
    });
    if (!attached) throw badRequest("Validation failed", { fileId: ["notAnAttachedImage"] });
  }
  const row = await db.project.update({ where: { id }, data: { coverFileId: input.fileId }, include: projectInclude });
  return toProject(row, await loadLinked(householdId, [id]));
}

/** Deletes the project. Linked tasks, expenses and items stay; they just lose the link (SetNull). */
export async function deleteProject(householdId: string, id: string): Promise<void> {
  await findOwnProject(householdId, id);
  await db.project.delete({ where: { id } });
  await forgetDocumentLinks("project", id);
  await forgetEntity("project", id);
}

/** Links an existing task, one-off expense, recurring expense (with all its instances) or shopping item. */
export async function linkToProject(householdId: string, id: string, input: ProjectLinkInput): Promise<void> {
  await findOwnProject(householdId, id);
  const missing = () => notFound("Item not found");
  switch (input.kind) {
    case "task": {
      const { count } = await db.task.updateMany({ where: { id: input.id, householdId }, data: { projectId: id } });
      if (!count) throw missing();
      return;
    }
    case "expense": {
      const { count } = await db.expense.updateMany({ where: { id: input.id, householdId }, data: { projectId: id } });
      if (!count) throw missing();
      return;
    }
    case "recurring": {
      const { count } = await db.recurringExpense.updateMany({ where: { id: input.id, householdId }, data: { projectId: id } });
      if (!count) throw missing();
      await db.expense.updateMany({ where: { householdId, recurringExpenseId: input.id }, data: { projectId: id } });
      return;
    }
    case "item": {
      const { count } = await db.shoppingItem.updateMany({ where: { id: input.id, householdId }, data: { projectId: id } });
      if (!count) throw missing();
      return;
    }
  }
}

/** Removes a link (only when it points at this project). A recurring expense's instances follow its template. */
export async function unlinkFromProject(householdId: string, id: string, input: ProjectLinkInput): Promise<void> {
  await findOwnProject(householdId, id);
  const where = { id: input.id, householdId, projectId: id };
  switch (input.kind) {
    case "task":
      await db.task.updateMany({ where, data: { projectId: null } });
      return;
    case "expense": {
      const { count } = await db.expense.updateMany({ where, data: { projectId: null } });
      // Its materials are no longer on an invoice of the project: they count as bought items again.
      if (count) await db.shoppingItem.updateMany({ where: { householdId, expenseId: input.id }, data: { expenseId: null } });
      return;
    }
    case "recurring":
      await db.recurringExpense.updateMany({ where, data: { projectId: null } });
      await db.expense.updateMany({ where: { householdId, recurringExpenseId: input.id, projectId: id }, data: { projectId: null } });
      return;
    case "item":
      await db.shoppingItem.updateMany({ where, data: { projectId: null } });
      return;
  }
}

/**
 * "Log as expense": the bought materials were paid with this expense. The expense joins the project (when it
 * isn't linked yet) and the items point at it, so the budget counts the expense and no longer the items.
 */
export async function recordProjectPurchase(householdId: string, id: string, input: ProjectPurchaseInput): Promise<void> {
  await findOwnProject(householdId, id);
  const expense = await db.expense.findFirst({ where: { id: input.expenseId, householdId }, select: { id: true, projectId: true } });
  if (!expense) throw notFound("Expense not found");
  const { materials } = await loadLinked(householdId, [id]);
  const own = new Set((materials.get(id) ?? []).map((material) => material.id));
  const itemIds = input.itemIds.filter((itemId) => own.has(itemId));
  if (itemIds.length === 0) throw badRequest("Validation failed", { itemIds: ["notProjectMaterials"] });
  await db.$transaction([
    ...(expense.projectId ? [] : [db.expense.update({ where: { id: expense.id }, data: { projectId: id } })]),
    db.shoppingItem.updateMany({ where: { householdId, id: { in: itemIds } }, data: { expenseId: expense.id } }),
  ]);
}

/**
 * "Link materials": which of the project's materials are on this invoice (expense), as a whole. The expense
 * joins the project when it isn't linked yet; open materials become bought (on the day it was paid, else
 * today); prices become the invoice prices when given; materials no longer in the list lose the link (and stay
 * bought); invoice lines that weren't on the list are added as bought materials. The budget then counts the
 * expense once and these materials no more.
 */
export async function linkExpenseMaterials(
  user: Pick<SessionUser, "id" | "householdId" | "locale">,
  id: string,
  expenseId: string,
  input: ProjectExpenseMaterialsInput,
): Promise<void> {
  const { householdId } = user;
  await findOwnProject(householdId, id);
  const expense = await db.expense.findFirst({ where: { id: expenseId, householdId }, select: { id: true, projectId: true, paidOn: true } });
  if (!expense) throw notFound("Expense not found");
  const { materials } = await loadLinked(householdId, [id]);
  const own = new Map((materials.get(id) ?? []).map((material) => [material.id, material]));
  const itemIds = [...new Set(input.itemIds)];
  if (itemIds.some((itemId) => !own.has(itemId)) || input.prices.some((price) => !own.has(price.itemId))) {
    throw badRequest("Validation failed", { itemIds: ["notProjectMaterials"] });
  }
  const selected = new Set(itemIds);
  const dropped = [...own.values()].filter((material) => material.expenseId === expense.id && !selected.has(material.id)).map((material) => material.id);
  const toBuy = itemIds.filter((itemId) => !own.get(itemId)?.bought);
  const boughtAt = expense.paidOn ?? new Date();
  const bought = { status: "BOUGHT" as const, boughtAt, boughtByUserId: user.id };

  // New lines go on the materials list like any material, then join the invoice with the others.
  const shopIds = new Set(
    (await db.shoppingItem.findMany({ where: { householdId, id: { in: itemIds } }, select: { shopId: true } })).map((item) => item.shopId),
  );
  const shopId = shopIds.size === 1 ? ([...shopIds][0] ?? null) : null;
  const created: string[] = [];
  for (const line of input.newItems) {
    const item = await createItem(user, { name: line.name, quantity: line.quantity, priceCents: line.priceCents, source: "task", projectId: id, shopId });
    created.push(item.id);
  }

  await db.$transaction([
    ...(expense.projectId ? [] : [db.expense.update({ where: { id: expense.id }, data: { projectId: id } })]),
    db.shoppingItem.updateMany({ where: { householdId, id: { in: dropped } }, data: { expenseId: null } }),
    db.shoppingItem.updateMany({ where: { householdId, id: { in: [...itemIds, ...created] } }, data: { expenseId: expense.id } }),
    ...(input.markBought ? [db.shoppingItem.updateMany({ where: { householdId, id: { in: [...toBuy, ...created] }, status: "OPEN" }, data: bought })] : []),
    ...input.prices.map((price) => db.shoppingItem.update({ where: { id: price.itemId }, data: { priceCents: price.priceCents } })),
  ]);
}

/** Takes one material off its invoice (it stays bought, and counts as a bought item again). */
export async function unlinkExpenseMaterial(householdId: string, id: string, expenseId: string, itemId: string): Promise<void> {
  const materials = await listProjectMaterials(householdId, id);
  const material = materials.find((candidate) => candidate.id === itemId && candidate.expenseId === expenseId);
  if (!material) throw notFound("Material not found on this invoice");
  await db.shoppingItem.updateMany({ where: { householdId, id: itemId, expenseId }, data: { expenseId: null } });
}
