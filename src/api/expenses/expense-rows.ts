import { expenseStatus, exactYearlyCents } from "@/features/expenses/types/expense-calculations";
import {
  EXPENSE_MONTH_END,
  EXPENSE_RRULE_SUPPORT,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseKind,
  type ExpenseShare,
  type PayerType,
  type PaymentMethod,
  type RecurringExpense,
  type RecurringExpenseInput,
  type RecurringStatus,
} from "@/features/expenses/types/expenses";
import { totalOpenProgress, type InstanceForProgress, type TotalOpenProgress } from "@/features/expenses/types/total-open";
import { addDays } from "@/types/dates";
import { nextOccurrence, parseRRule } from "@/types/recurrence";
import type {
  ExpenseCategory as CategoryRow,
  ExpenseKind as KindRow,
  ExpensePayerType as PayerTypeRow,
  PaymentMethod as PaymentMethodRow,
  Prisma,
  RecurringExpenseStatus as StatusRow,
} from "../lib/db";

/*
 * Rows ↔ contracts for expenses. Contracts use lowercase enums and `YYYY-MM-DD` strings; Prisma uses
 * UPPERCASE enums and Date columns (`@db.Date`, midnight UTC).
 */

export const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const fromDate = (date: Date) => date.toISOString().slice(0, 10);
const optionalDate = (date: Date | null) => (date ? fromDate(date) : null);

const lower = <T extends string>(value: string) => value.toLowerCase() as T;
export const toCategory = (value: CategoryRow) => lower<ExpenseCategory>(value);
export const fromCategory = (value: ExpenseCategory) => value.toUpperCase() as CategoryRow;
export const toKind = (value: KindRow) => lower<ExpenseKind>(value);
export const fromKind = (value: ExpenseKind) => value.toUpperCase() as KindRow;
export const toStatus = (value: StatusRow) => lower<RecurringStatus>(value);
export const fromStatus = (value: RecurringStatus) => value.toUpperCase() as StatusRow;
export const toMethod = (value: PaymentMethodRow | null) => (value ? lower<PaymentMethod>(value) : null);
export const fromMethod = (value: PaymentMethod | null | undefined) => (value ? (value.toUpperCase() as PaymentMethodRow) : null);
export const toPayerType = (value: PayerTypeRow) => lower<PayerType>(value);
export const fromPayerType = (value: PayerType) => value.toUpperCase() as PayerTypeRow;

/** The project chip (projects feature). */
const projectRefSelect = { select: { id: true, name: true, color: true } } as const;
export const expenseInclude = {
  shares: true,
  recurringExpense: { select: { rrule: true, kind: true } },
  project: projectRefSelect,
} as const;
export type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;
export const recurringInclude = { shares: true, project: projectRefSelect } as const;
export type RecurringRow = Prisma.RecurringExpenseGetPayload<{ include: typeof recurringInclude }>;

const toShares = (rows: { habitantId: string; amountCents: number }[]): ExpenseShare[] =>
  rows.map((row) => ({ habitantId: row.habitantId, amountCents: row.amountCents }));

/** Columns an expense and a recurring template share. */
type PaymentColumns = Pick<
  ExpenseRow,
  | "payee"
  | "description"
  | "amountCents"
  | "category"
  | "paymentMethod"
  | "beneficiaryName"
  | "iban"
  | "bic"
  | "structuredCommunication"
  | "reference"
  | "payerType"
  | "payerHabitantId"
  | "notes"
> & {
  shares: { habitantId: string; amountCents: number }[];
  project: { id: string; name: string; color: string } | null;
};

function toPaymentDetails(row: PaymentColumns) {
  const payerType = toPayerType(row.payerType);
  return {
    payee: row.payee,
    description: row.description,
    amountCents: row.amountCents,
    category: toCategory(row.category),
    paymentMethod: toMethod(row.paymentMethod),
    beneficiaryName: row.beneficiaryName,
    iban: row.iban,
    bic: row.bic,
    structuredCommunication: row.structuredCommunication,
    reference: row.reference,
    payerType,
    payerHabitantId: payerType === "person" ? row.payerHabitantId : null,
    shares: payerType === "split" ? toShares(row.shares) : [],
    notes: row.notes,
    project: row.project ? { id: row.project.id, name: row.project.name, color: row.project.color } : null,
  };
}

export function toExpense(row: ExpenseRow, today: string): Expense {
  const dueDate = fromDate(row.dueDate);
  const paidOn = optionalDate(row.paidOn);
  return {
    id: row.id,
    ...toPaymentDetails(row),
    recurringExpenseId: row.recurringExpenseId,
    rrule: row.recurringExpense?.rrule ?? null,
    kind: row.recurringExpense ? toKind(row.recurringExpense.kind) : null,
    dueDate,
    status: expenseStatus({ dueDate, paidOn }, today),
    shopId: row.shopId,
    paidOn,
    paidById: row.paidById,
    autoPaid: paidOn !== null && row.autoPaidAt !== null,
  };
}

/** The next occurrence on or after `today`, within the end date; `null` when not active. */
export function nextDueDateOf(row: Pick<RecurringRow, "rrule" | "startDate" | "endDate" | "status">, today: string): string | null {
  if (row.status !== "ACTIVE") return null;
  const rule = parseRRule(row.rrule, EXPENSE_RRULE_SUPPORT);
  const next = rule ? nextOccurrence(rule, fromDate(row.startDate), today, { monthEnd: EXPENSE_MONTH_END }) : null;
  if (next && row.endDate && next > fromDate(row.endDate)) return null;
  return next;
}

/**
 * Loan progress of a template with a total open amount. `instances` are its instances (any due date);
 * without them only the plan is known, so pass them wherever the progress is shown (`loadInstancesForProgress`).
 */
export function totalOpenOf(row: RecurringRow, instances: readonly InstanceForProgress[] = []): TotalOpenProgress | null {
  if (!row.totalOpenCents || !row.totalOpenAsOf) return null;
  return totalOpenProgress({
    amountCents: row.amountCents,
    totalOpenCents: row.totalOpenCents,
    asOf: fromDate(row.totalOpenAsOf),
    rrule: row.rrule,
    startDate: fromDate(row.startDate),
    generatedUntil: optionalDate(row.generatedUntil),
    status: toStatus(row.status),
    instances,
  });
}

export function toRecurring(row: RecurringRow, today: string, instances?: readonly InstanceForProgress[]): RecurringExpense {
  const status = toStatus(row.status);
  const trialEndsOn = optionalDate(row.trialEndsOn);
  const nextDueDate = nextDueDateOf(row, today);
  const yearly = exactYearlyCents(row.amountCents, row.rrule);
  return {
    id: row.id,
    ...toPaymentDetails(row),
    kind: toKind(row.kind),
    status,
    rrule: row.rrule,
    startDate: fromDate(row.startDate),
    endDate: optionalDate(row.endDate),
    websiteUrl: row.websiteUrl,
    trialEndsOn,
    inTrial: trialEndsOn !== null && trialEndsOn >= today,
    remindDaysBefore: row.remindDaysBefore,
    reminderOn: nextDueDate && row.remindDaysBefore !== null ? addDays(nextDueDate, -row.remindDaysBefore) : null,
    candidateToCancel: row.candidateToCancel,
    nextDueDate,
    monthlyCents: Math.round(yearly / 12),
    yearlyCents: Math.round(yearly),
    totalOpen: totalOpenOf(row, instances),
  };
}

/** Columns written from an input: shared by one-off expenses, instances and templates. */
export const paymentData = (input: ExpenseInput | RecurringExpenseInput) => ({
  payee: input.payee,
  description: input.description || null,
  amountCents: input.amountCents,
  category: fromCategory(input.category),
  paymentMethod: fromMethod(input.paymentMethod),
  beneficiaryName: input.beneficiaryName || null,
  iban: input.iban || null,
  bic: input.bic || null,
  structuredCommunication: input.structuredCommunication || null,
  reference: input.structuredCommunication ? null : input.reference || null,
  payerType: fromPayerType(input.payerType),
  payerHabitantId: input.payerType === "person" ? (input.payerHabitantId ?? null) : null,
  notes: input.notes || null,
  // Left out (undefined): an edit keeps the project; null removes it.
  ...(input.projectId !== undefined && { projectId: input.projectId || null }),
});

/** Template-only columns. */
export const recurringData = (input: Omit<RecurringExpenseInput, "startDate" | "rrule">) => ({
  kind: fromKind(input.kind),
  websiteUrl: input.websiteUrl || null,
  trialEndsOn: input.trialEndsOn ? toDate(input.trialEndsOn) : null,
  remindDaysBefore: input.remindDaysBefore ?? null,
  candidateToCancel: input.candidateToCancel,
});

export const sharesCreate = (shares: ExpenseShare[]) => ({
  create: shares.map((share) => ({ habitantId: share.habitantId, amountCents: share.amountCents })),
});
