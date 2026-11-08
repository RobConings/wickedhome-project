import { projectAllocationInputSchema, type ExpenseAllocationView, type ProjectAllocationInput } from "@/features/expenses/types/project-allocation";
import { db, type Prisma } from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";
import { publish } from "../lib/events";
import { emitExpenseChanged } from "./expense-events";

const include = { project: { select: { id: true, name: true } }, projectAllocations: { include: { project: { select: { name: true } } } } } as const;
type Row = Prisma.ExpenseGetPayload<{ include: typeof include }>;
function view(row: Row): ExpenseAllocationView {
  const explicit = row.allocationHouseholdCents !== null || row.projectAllocations.length > 0;
  const projects = explicit ? row.projectAllocations.map((part) => ({ projectId: part.projectId, name: part.project?.name ?? part.projectName, amountCents: part.amountCents }))
    : row.project ? [{ projectId: row.project.id, name: row.project.name, amountCents: row.amountCents }] : [];
  const householdCents = explicit ? row.allocationHouseholdCents ?? 0 : row.project ? 0 : row.amountCents;
  return { expenseId: row.id, totalCents: row.amountCents, revision: row.updatedAt.toISOString(), explicit, projects, householdCents,
    unallocatedCents: row.amountCents - householdCents - projects.reduce((sum, part) => sum + part.amountCents, 0) };
}

export async function getExpenseAllocation(householdId: string, id: string): Promise<ExpenseAllocationView> {
  const row = await db.expense.findFirst({ where: { id, householdId }, include });
  if (!row) throw notFound("Expense not found");
  return view(row);
}

/** Replaces shares of the SAME expense under its row lock. No stock or account writes. */
export async function setExpenseAllocation(householdId: string, id: string, input: ProjectAllocationInput): Promise<ExpenseAllocationView> {
  const parsed = projectAllocationInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Check the allocation amounts and revision");
  input = parsed.data;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "bills" WHERE "id" = ${id} AND "householdId" = ${householdId} FOR UPDATE`;
    const row = await tx.expense.findFirst({ where: { id, householdId }, include });
    if (!row) throw notFound("Expense not found");
    const current = view(row);
    const normalize = (parts: { projectId: string | null; amountCents: number }[]) => JSON.stringify([...parts].map((part) => [part.projectId, part.amountCents]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    if (current.explicit && input.householdCents === current.householdCents && normalize(input.projects) === normalize(current.projects)) return current;
    if (row.updatedAt.toISOString() !== input.revision) throw conflict("The expense changed. Review the current allocation before saving.");
    if (new Set(input.projects.map((part) => part.projectId)).size !== input.projects.length) throw badRequest("Choose each project once");
    if (input.householdCents + input.projects.reduce((sum, part) => sum + part.amountCents, 0) > row.amountCents)
      throw badRequest("Allocated amounts exceed the expense total", { projects: ["Allocated amounts exceed the expense total"] });
    const projects = await tx.project.findMany({ where: { householdId, id: { in: input.projects.map((part) => part.projectId) } }, select: { id: true, name: true } });
    if (projects.length !== input.projects.length) throw badRequest("Choose projects available to this household");
    const materials = await tx.shoppingItem.findMany({ where: { householdId, expenseId: id }, select: { projectId: true, taskId: true } });
    const tasks = await tx.task.findMany({ where: { householdId, id: { in: materials.flatMap((item) => item.taskId ? [item.taskId] : []) } }, select: { id: true, projectId: true } });
    const taskProjects = new Map(tasks.map((task) => [task.id, task.projectId]));
    const selectedProjects = new Set(input.projects.map((part) => part.projectId));
    if (materials.some((item) => { const projectId = item.projectId ?? (item.taskId ? taskProjects.get(item.taskId) : null); return projectId && !selectedProjects.has(projectId); }))
      throw badRequest("Unlink the project's invoice materials before removing its cost allocation");
    await tx.expenseProjectAllocation.deleteMany({ where: { expenseId: id } });
    if (input.projects.length) await tx.expenseProjectAllocation.createMany({ data: input.projects.map((part) => ({ expenseId: id, projectId: part.projectId, projectName: projects.find((project) => project.id === part.projectId)!.name, amountCents: part.amountCents })) });
    const changed = await tx.expense.update({ where: { id }, data: { allocationHouseholdCents: input.householdCents, projectId: input.projects.length === 1 ? input.projects[0]!.projectId : null, updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) }, include });
    return view(changed);
  });
  await emitExpenseChanged(householdId, id, "updated");
  publish(householdId, "projects.changed", { scope: "allocations", expenseId: id });
  return result;
}
