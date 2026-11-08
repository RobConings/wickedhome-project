import type { AuditEntry } from "@/features/audit/types/audit";
import { db } from "../lib/db";

type Owner = { path: (id: string) => string; find: (householdId: string, ids: string[]) => Promise<{ id: string }[]> };
const path = (base: string) => (id: string) => `${base}/${encodeURIComponent(id)}`;
const where = (householdId: string, ids: string[]) => ({ householdId, id: { in: ids } });

/** Only surviving, household-scoped owners become links. Historical labels are never rewritten. */
const owners: Record<string, Owner> = {
  task: { path: path("/tasks"), find: (home, ids) => db.task.findMany({ where: where(home, ids), select: { id: true } }) },
  project: { path: path("/projects"), find: (home, ids) => db.project.findMany({ where: where(home, ids), select: { id: true } }) },
  expense: { path: path("/expenses"), find: (home, ids) => db.expense.findMany({ where: where(home, ids), select: { id: true } }) },
  recurring_expense: { path: path("/expenses/recurring"), find: (home, ids) => db.recurringExpense.findMany({ where: where(home, ids), select: { id: true } }) },
  product: { path: path("/inventory/products"), find: (home, ids) => db.product.findMany({ where: where(home, ids), select: { id: true } }) },
  contact: { path: path("/contacts"), find: (home, ids) => db.contact.findMany({ where: where(home, ids), select: { id: true } }) },
  habitant: { path: path("/habitants"), find: (home, ids) => db.habitant.findMany({ where: where(home, ids), select: { id: true } }) },
  place: { path: path("/places"), find: (home, ids) => db.place.findMany({ where: where(home, ids), select: { id: true } }) },
  device: { path: path("/devices"), find: (home, ids) => db.device.findMany({ where: where(home, ids), select: { id: true } }) },
  document: { path: path("/documents/files"), find: (home, ids) => db.documentFile.findMany({ where: where(home, ids), select: { id: true } }) },
  income_source: { path: path("/income/sources"), find: (home, ids) => db.incomeSource.findMany({ where: where(home, ids), select: { id: true } }) },
  income: { path: path("/income/receipts"), find: (home, ids) => db.income.findMany({ where: where(home, ids), select: { id: true } }) },
  contribution_plan: { path: path("/money/plans"), find: (home, ids) => db.contributionPlan.findMany({ where: where(home, ids), select: { id: true } }) },
  payment_account: { path: (id) => `/money?tab=history&account=${encodeURIComponent(id)}`, find: (home, ids) => db.paymentAccount.findMany({ where: { ...where(home, ids), kind: { in: ["JOINT", "SAVINGS"] } }, select: { id: true } }) },
  shop: { path: path("/shops"), find: (home, ids) => db.shop.findMany({ where: { id: { in: ids }, OR: [{ householdId: home }, { householdId: null }] }, select: { id: true } }) },
};

export async function auditTargets(householdId: string, entries: AuditEntry[]): Promise<AuditEntry[]> {
  const groups = new Map<string, Set<string>>();
  for (const entry of entries) if (entry.targetType && entry.targetId && Object.hasOwn(owners, entry.targetType)) {
    const ids = groups.get(entry.targetType) ?? new Set<string>();
    ids.add(entry.targetId); groups.set(entry.targetType, ids);
  }
  const resolved = new Map<string, Map<string, string>>();
  await Promise.all([...groups].map(async ([type, ids]) => {
    const owner = owners[type]!;
    const rows = await owner.find(householdId, [...ids]);
    resolved.set(type, new Map(rows.map((row) => [row.id, owner.path(row.id)])));
  }));
  return entries.map((entry) => ({ ...entry, targetUrl: entry.targetType && entry.targetId ? resolved.get(entry.targetType)?.get(entry.targetId) ?? null : null }));
}
