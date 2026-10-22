import type { Locale } from "@/types/common";
import { addDays, todayIn } from "@/types/dates";
import { onExpenseChanged } from "../expenses/expense-events";
import { listUnpaidManualPayments, markExpensePaid, markExpenseUnpaid, type ManualPayment } from "../expenses/expenses.service";
import { registerJob } from "../jobs/job-registry";
import { db } from "../lib/db";
import { registerLinkedTaskHandler } from "./linked-task-handlers";
import {
  completeLinkedTask,
  listLinkedTasks,
  removeLinkedTask,
  reopenLinkedTask,
  upsertLinkedTask,
  type LinkedTaskState,
} from "./linked-tasks";

/*
 * Pay tasks: every unpaid expense that someone has to pay by hand (anything but a direct debit) gets a
 * linked task "Pay Watergroep · € 52,30" (an errand), due the day before the expense's due date, for the
 * people who pay it. Done task ⇄ paid expense, both ways:
 * - completing the task marks the expense paid (today, by whoever did it); reopening marks it unpaid;
 * - paying or unpaying the expense on its own page completes or reopens the task (`onExpenseChanged`);
 * - the daily job `tasks.pay-tasks` reconciles everything (new instances, edits, deletes, missed events).
 * Tasks only go one way into expenses through the expenses service; expenses never import tasks.
 */

export const EXPENSE_ORIGIN = "expense";
/** Expenses due up to two weeks ahead get a task; overdue ones keep theirs until paid. */
export const PAY_TASK_DAYS = 14;
const OVERDUE_DAYS = 90;

const expenseHref = (id: string) => `/expenses/${encodeURIComponent(id)}`;

const PAY_PREFIX: Record<Locale, string> = { en: "Pay", nl: "Betaal" };
const MONEY_LOCALE: Record<Locale, string> = { en: "en-BE", nl: "nl-BE" };

/** "Pay Watergroep · € 52,30" (stored, so in the household's language). */
export function payTaskTitle(payee: string, amountCents: number, locale: string): string {
  const lang: Locale = locale === "nl" ? "nl" : "en";
  // Plain spaces: Intl puts a no-break space between "€" and the amount.
  const amount = new Intl.NumberFormat(MONEY_LOCALE[lang], { style: "currency", currency: "EUR" })
    .format(amountCents / 100)
    .replace(/[\u00a0\u202f]/g, " ");
  return `${PAY_PREFIX[lang]} ${payee.trim()} · ${amount}`;
}

/** Who pays: the person, or everyone with a share; a joint payment starts unassigned. */
export function payTaskAssignees(payment: Pick<ManualPayment, "payerType" | "payerHabitantId" | "shares">): string[] {
  if (payment.payerType === "person") return payment.payerHabitantId ? [payment.payerHabitantId] : [];
  if (payment.payerType === "split") return [...new Set(payment.shares.filter((share) => share.amountCents > 0).map((share) => share.habitantId))];
  return [];
}

export type PayTaskPlanItem = { expenseId: string; title: string; dueDate: string; originDate: string; assigneeIds?: string[] };

/**
 * Pure: the pay tasks the unpaid manual payments need (due today − 90 days … today + 14 days). Tasks people
 * already assigned keep their assignees. Existing tasks for expenses not in `payments` are left to the
 * caller, which knows whether the expense was paid (complete), deleted or changed to a direct debit (remove).
 */
export function planPayTasks({
  payments,
  existing,
  today,
  locale,
}: {
  payments: Pick<ManualPayment, "id" | "payee" | "amountCents" | "dueDate" | "payerType" | "payerHabitantId" | "shares">[];
  existing: Pick<LinkedTaskState, "originId" | "status" | "assigneeIds">[];
  today: string;
  locale: string;
}): { upserts: PayTaskPlanItem[]; others: string[] } {
  const byId = new Map(existing.map((task) => [task.originId, task]));
  const inWindow = payments.filter((payment) => payment.dueDate >= addDays(today, -OVERDUE_DAYS) && payment.dueDate <= addDays(today, PAY_TASK_DAYS));
  const wanted = new Set(inWindow.map((payment) => payment.id));
  const upserts = inWindow.map((payment) => {
    const current = byId.get(payment.id);
    const assignees = payTaskAssignees(payment);
    const keep = current && current.assigneeIds.length > 0;
    return {
      expenseId: payment.id,
      title: payTaskTitle(payment.payee, payment.amountCents, locale),
      dueDate: addDays(payment.dueDate, -1),
      originDate: payment.dueDate,
      ...(!keep && { assigneeIds: assignees }),
    };
  });
  return { upserts, others: existing.filter((task) => !wanted.has(task.originId)).map((task) => task.originId) };
}

async function householdLocale(householdId: string): Promise<string> {
  const users = await db.user.findMany({ where: { householdId }, select: { locale: true, role: true }, orderBy: { createdAt: "asc" } });
  return (users.find((user) => user.role === "OWNER") ?? users[0])?.locale ?? "en";
}

async function upsertPayTask(householdId: string, item: PayTaskPlanItem) {
  return upsertLinkedTask({
    householdId,
    origin: { type: EXPENSE_ORIGIN, id: item.expenseId, date: item.originDate, href: expenseHref(item.expenseId) },
    title: item.title,
    type: "errand",
    dueDate: item.dueDate,
    ...(item.assigneeIds !== undefined && { assigneeIds: item.assigneeIds }),
  });
}

/** An expense without a wanted task: paid → its task is done; gone, direct debit or far ahead → open task removed. */
async function settleOther(householdId: string, expenseId: string, paid: boolean | null): Promise<"completed" | "removed" | null> {
  if (paid) return (await completeLinkedTask({ householdId, type: EXPENSE_ORIGIN, id: expenseId })) ? "completed" : null;
  return (await removeLinkedTask({ householdId, type: EXPENSE_ORIGIN, id: expenseId })) ? "removed" : null;
}

export type PayTaskSyncResult = { created: number; updated: number; completed: number; reopened: number; removed: number };

/** Reconciles one household's pay tasks with its expenses. Idempotent. */
export async function syncPayTasks(householdId: string): Promise<PayTaskSyncResult> {
  const today = todayIn();
  const [payments, existing, locale] = await Promise.all([
    listUnpaidManualPayments(householdId, addDays(today, -OVERDUE_DAYS), addDays(today, PAY_TASK_DAYS)),
    listLinkedTasks(householdId, EXPENSE_ORIGIN),
    householdLocale(householdId),
  ]);
  const plan = planPayTasks({ payments, existing, today, locale });
  const result: PayTaskSyncResult = { created: 0, updated: 0, completed: 0, reopened: 0, removed: 0 };
  const states = new Map(existing.map((task) => [task.originId, task.status]));

  for (const item of plan.upserts) {
    // Unpaid again (undone on the expense page while the task was done): the task opens again too.
    if (states.get(item.expenseId) === "done" && (await reopenLinkedTask({ householdId, type: EXPENSE_ORIGIN, id: item.expenseId }))) {
      result.reopened += 1;
    }
    const { action } = await upsertPayTask(householdId, item);
    if (action === "created") result.created += 1;
    else if (action === "updated") result.updated += 1;
  }

  const others = plan.others.filter((id) => states.get(id) === "open");
  const paid = new Map(
    (await db.expense.findMany({ where: { householdId, id: { in: others } }, select: { id: true, paidOn: true } })).map((row) => [
      row.id,
      row.paidOn !== null,
    ]),
  );
  for (const expenseId of others) {
    const outcome = await settleOther(householdId, expenseId, paid.get(expenseId) ?? null);
    if (outcome) result[outcome] += 1;
  }
  return result;
}

/** Brings the pay task of one expense in line right away (after it was created, edited, paid, unpaid or deleted). */
export async function syncExpensePayTask(householdId: string, expenseId: string): Promise<void> {
  const today = todayIn();
  const expense = await db.expense.findFirst({
    where: { id: expenseId, householdId },
    select: { id: true, dueDate: true, paidOn: true },
  });
  if (!expense) {
    await removeLinkedTask({ householdId, type: EXPENSE_ORIGIN, id: expenseId });
    return;
  }
  const due = expense.dueDate.toISOString().slice(0, 10);
  const [payment] = (await listUnpaidManualPayments(householdId, due, due)).filter((candidate) => candidate.id === expenseId);
  const [existing] = (await listLinkedTasks(householdId, EXPENSE_ORIGIN)).filter((task) => task.originId === expenseId);
  const plan = planPayTasks({ payments: payment ? [payment] : [], existing: existing ? [existing] : [], today, locale: await householdLocale(householdId) });
  const [item] = plan.upserts;
  if (item) {
    if (existing?.status === "done") await reopenLinkedTask({ householdId, type: EXPENSE_ORIGIN, id: expenseId });
    await upsertPayTask(householdId, item);
  } else if (existing?.status === "open") {
    await settleOther(householdId, expenseId, expense.paidOn !== null);
  }
}

/** Every household with expenses, one after the other. The daily safety net behind the instant updates. */
export async function syncAllPayTasks(context?: { signal?: AbortSignal; log?: (message: string) => void }): Promise<{ summary: string }> {
  const households = await db.household.findMany({ select: { id: true } });
  const total: PayTaskSyncResult = { created: 0, updated: 0, completed: 0, reopened: 0, removed: 0 };
  for (const { id } of households) {
    if (context?.signal?.aborted) break;
    const result = await syncPayTasks(id);
    for (const key of Object.keys(total) as (keyof PayTaskSyncResult)[]) total[key] += result[key];
  }
  const summary = `${total.created} created, ${total.updated} updated, ${total.completed} completed, ${total.reopened} reopened, ${total.removed} removed`;
  context?.log?.(summary);
  return { summary };
}

// ── Wiring ────────────────────────────────────────────────────────────────────────────────────────────

// Task → expense: done marks it paid (today, by whoever did it); undo marks it unpaid. Skipping does nothing.
registerLinkedTaskHandler(EXPENSE_ORIGIN, {
  async onClosed({ householdId, originId, outcome, completedById }) {
    if (outcome !== "done") return;
    await markExpensePaid(householdId, originId, { paidOn: todayIn(), paidById: completedById });
  },
  async onReopened({ householdId, originId }) {
    await markExpenseUnpaid(householdId, originId);
  },
});

// Expense → task: every change on the expenses side updates its pay task at once. The sync is a no-op
// when the task already matches, so the event our own "done → paid" causes comes back harmlessly. One
// subscription only, also when this module is evaluated again (dev reloads).
const SUBSCRIPTION = Symbol.for("wickedhome.payTasks.expenseListener");
const registry = globalThis as typeof globalThis & { [SUBSCRIPTION]?: () => void };
registry[SUBSCRIPTION]?.();
registry[SUBSCRIPTION] = onExpenseChanged(({ householdId, expenseId }) => syncExpensePayTask(householdId, expenseId));

registerJob({
  id: "tasks.pay-tasks",
  schedule: "25 6 * * *",
  titleKey: "tasks:jobs.payTasks.title",
  descriptionKey: "tasks:jobs.payTasks.description",
  runOnStartupIfMissed: true,
  run: ({ signal, log }) => syncAllPayTasks({ signal, log }),
});
