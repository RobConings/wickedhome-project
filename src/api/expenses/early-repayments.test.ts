import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { expenseCreateInputSchema, expenseInputSchema } from "@/features/expenses/types/expenses";
import { addDays, todayIn } from "@/types/dates";
import { formatDate } from "@/types/date-format";
import { db, type Prisma } from "../lib/db";
import { HttpError } from "../lib/http";
import { type ExpenseRow, type RecurringRow, toDate, toRecurring } from "./expense-rows";
import { createExpense, deleteExpense, getRecurringExpenseDetail, listExpenseFlow, markExpensePaid, markExpenseUnpaid, patchExpenseDetails, updateExpense } from "./expenses.service";
import { expensesCalendarSource } from "./expenses.calendar";

const cleanup: (() => void)[] = [];
function stub<T extends object>(object: T, key: keyof T, implementation: unknown) {
  const original = object[key];
  Object.assign(object, { [key]: implementation });
  cleanup.push(() => { Object.assign(object, { [key]: original }); });
}

const today = todayIn();
const asOf = `${today.slice(0, 7)}-01`;
const paymentFields = {
  payee: "House loan", description: null, category: "LOANS", paymentMethod: "WIRE_TRANSFER",
  beneficiaryName: null, iban: null, bic: null, structuredCommunication: null, reference: null,
  payerType: "JOINT", payerHabitantId: null, notes: null, paymentAccountId: "account-1", projectId: null,
  project: null, shares: [], householdId: "home",
} as const;

/** A scoped in-memory store exercises the actual service, generation and undo paths without a database. */
function store() {
  const loan = {
    ...paymentFields, id: "loan-1", kind: "LOAN", status: "ACTIVE", amountCents: 23000,
    totalOpenCents: 100_000, totalOpenAsOf: toDate(asOf), startDate: toDate(asOf), endDate: null,
    rrule: "FREQ=MONTHLY", generatedUntil: null,
    remindDaysBefore: null, trialEndsOn: null, websiteUrl: null, candidateToCancel: false,
  } as unknown as RecurringRow;
  let rows: ExpenseRow[] = [];
  let seq = 0;
  const matches = (row: ExpenseRow, where: Record<string, unknown>): boolean => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((part) => matches(row, part));
    if (key === "AND") return (value as Record<string, unknown>[]).every((part) => matches(row, part));
    if (key === "NOT") return !matches(row, value as Record<string, unknown>);
    const actual = row[key as keyof ExpenseRow];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const filter = value as { not?: unknown; gte?: Date; lte?: Date; in?: unknown[] };
      if ("not" in filter && actual === filter.not) return false;
      if (filter.gte && (!(actual instanceof Date) || actual < filter.gte)) return false;
      if (filter.lte && (!(actual instanceof Date) || actual > filter.lte)) return false;
      if (filter.in && !filter.in.some((value) => value instanceof Date && actual instanceof Date ? value.getTime() === actual.getTime() : value === actual)) return false;
      return true;
    }
    return value instanceof Date ? actual instanceof Date && actual.getTime() === value.getTime() : actual === value;
  });
  const create = (data: Record<string, unknown>) => {
    const row = {
      ...paymentFields, id: `expense-${++seq}`, amountCents: 0, paidOn: null, paidById: null, autoPaidAt: null,
      recurringExpenseId: null, earlyRepaymentForId: null, shopId: null, recurringExpense: null,
      earlyRepaymentFor: data.earlyRepaymentForId ? { kind: loan.kind, rrule: loan.rrule } : null,
      ...data, shares: [],
    } as unknown as ExpenseRow;
    rows.push(row);
    return row;
  };
  const expense = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where)).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => matches(row, where)) ?? null,
    aggregate: async ({ where }: { where: Record<string, unknown> }) => ({ _sum: { amountCents: rows.filter((row) => matches(row, where)).reduce((sum, row) => sum + row.amountCents, 0) } }),
    create: async ({ data }: { data: Record<string, unknown> }) => create(data),
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const item of data) {
        if (!rows.some((row) => row.recurringExpenseId === item.recurringExpenseId && row.dueDate.getTime() === (item.dueDate as Date).getTime())) create(item);
      }
      return { count: data.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((candidate) => candidate.id === where.id)!;
      Object.assign(row, data);
      row.shares = [];
      return row;
    },
    delete: async ({ where }: { where: { id: string } }) => { rows = rows.filter((row) => row.id !== where.id); },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => { rows = rows.filter((row) => !matches(row, where)); },
  };
  const tx = {
    $queryRaw: async () => [],
    expense: { ...expense, findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({ ...rows.find((row) => row.id === where.id), allocationHouseholdCents: null, projectAllocations: [] }) },
    expenseShare: { deleteMany: async () => ({ count: 0 }) },
    recurringExpense: {
      updateMany: async ({ where }: { where: { id: string; householdId: string } }) => ({ count: where.id === loan.id && where.householdId === loan.householdId ? 1 : 0 }),
      findFirstOrThrow: async () => loan,
      update: async ({ data }: { data: Partial<RecurringRow> }) => Object.assign(loan, data),
    },
  };
  stub(db, "$transaction", async (operation: unknown) => typeof operation === "function" ? operation(tx as unknown as Prisma.TransactionClient) : Promise.all(operation as Promise<unknown>[]));
  stub(db.expense, "findFirst", expense.findFirst);
  stub(db.expense, "findMany", expense.findMany);
  stub(db.recurringExpense, "findMany", async () => []);
  stub(db.recurringExpense, "findFirst", async ({ where }: { where: { id: string; householdId: string } }) => where.id === loan.id && where.householdId === loan.householdId ? loan : null);
  stub(db.documentLink, "updateMany", async () => ({ count: 0 }));
  stub(db.documentLink, "deleteMany", async () => ({ count: 0 }));
  return { loan, rows: () => rows, scheduled: () => rows.filter((row) => row.recurringExpenseId === loan.id), create };
}

const input = (amountCents: number, patch: Record<string, unknown> = {}) => expenseCreateInputSchema.parse({
  payee: "House loan", category: "loans", dueDate: today, paidOn: today, amountCents,
  earlyRepaymentForId: "loan-1", paymentMethod: "wire_transfer", ...patch,
});

describe("loan repayments through the normal expense service", () => {
  let data: ReturnType<typeof store>;
  beforeEach(() => { data = store(); });
  afterEach(() => { for (const restore of cleanup.splice(0).reverse()) restore(); });

  it("records a partial repayment as an expense and shortens the instalments", async () => {
    const paid = await createExpense("home", input(30_000));
    assert.equal(paid.earlyRepayment, true);
    assert.equal(paid.recurringExpenseId, "loan-1");
    assert.equal(paid.paidOn, today);
    assert.equal(data.rows().find((row) => row.id === paid.id)?.paymentAccountId, "account-1");
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 70_000);
    assert.deepEqual(data.scheduled().map((row) => row.amountCents), [23000, 23000, 23000, 1000]);
  });

  it("keeps an extra repayment separate from the regular instalment on the same day", async () => {
    data.create({ recurringExpenseId: "loan-1", dueDate: toDate(asOf), paidOn: null, amountCents: 23000 });
    await createExpense("home", input(30_000, { paidOn: asOf }));
    const sameDay = data.rows().filter((row) => row.dueDate.getTime() === toDate(asOf).getTime());
    assert.equal(sameDay.length, 2);
    assert.equal(sameDay.filter((row) => row.earlyRepaymentForId).length, 1);
    assert.equal(sameDay.filter((row) => row.recurringExpenseId).length, 1);
  });

  it("accepts several repayments on the same day and stops at a full payoff", async () => {
    await createExpense("home", input(30_000));
    await createExpense("home", input(70_000));
    assert.equal(data.rows().length, 2);
    assert.equal(data.scheduled().length, 0);
    const summary = toRecurring(data.loan, today, data.rows().map((row) => ({
      dueDate: row.dueDate.toISOString().slice(0, 10), amountCents: row.amountCents, paid: true, earlyRepayment: true,
    })));
    assert.equal(summary.monthlyCents, 0);
    assert.equal(summary.nextDueDate, null);
  });

  it("undoes, re-pays, edits and deletes a repayment with the schedule kept in step", async () => {
    const paid = await createExpense("home", input(100_000));
    await markExpenseUnpaid("home", paid.id);
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 100_000);
    await markExpensePaid("home", paid.id, { paidOn: today });
    assert.equal(data.scheduled().length, 0);
    await updateExpense("home", paid.id, expenseInputSchema.parse({ ...input(40_000), dueDate: today }));
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 60_000);
    await deleteExpense("home", paid.id);
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 100_000);
  });

  it("preserves paid instalments and subtracts them before validating an extra repayment", async () => {
    const historical = data.create({ recurringExpenseId: "loan-1", dueDate: toDate(asOf), paidOn: toDate(asOf), amountCents: 23000 });
    await assert.rejects(createExpense("home", input(80_000)), (error: unknown) => error instanceof HttpError && Boolean(error.fields?.amountCents));
    await createExpense("home", input(77_000));
    assert.equal(data.scheduled().length, 1);
    assert.equal(data.scheduled()[0]?.id, historical.id);
    assert.equal(historical.amountCents, 23000);
  });

  it("accepts payment before the first included instalment and shows the actual payment day", async () => {
    const firstInstalment = addDays(today, 20);
    Object.assign(data.loan, { startDate: toDate(firstInstalment), totalOpenAsOf: toDate(firstInstalment) });
    const repayment = await createExpense("home", input(30_000));
    assert.equal(repayment.paidOn, today);
    assert.equal(repayment.dueDate, today, "expense views and edits use the actual payment date");
    const stored = data.rows().find((row) => row.id === repayment.id)!;
    assert.equal(stored.dueDate.toISOString().slice(0, 10), firstInstalment, "the payment counts against the tracked loan balance");
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 70_000);
    assert.equal(data.scheduled()[0]?.dueDate.toISOString().slice(0, 10), firstInstalment, "the first regular instalment is still due");
    const detail = await getRecurringExpenseDetail("home", data.loan.id);
    assert.equal(detail.recurring.totalOpen?.remainingCents, 70_000);
    assert.equal(detail.history[0]?.paidOn, today);
    assert.equal(detail.history[0]?.dueDate, today);
    const calendar = await expensesCalendarSource.load({ householdId: "home", from: today, to: today });
    assert.deepEqual(calendar.map((item) => ({ id: item.id, start: item.start })), [{ id: repayment.id, start: today }]);
    const firstDay = await expensesCalendarSource.load({ householdId: "home", from: firstInstalment, to: firstInstalment });
    assert.equal(firstDay.some((item) => item.id === repayment.id), false, "the repayment is not shown again on the first instalment's day");
    const flow = await listExpenseFlow("home", today, today);
    assert.deepEqual(flow.map((item) => [item.date, item.amountCents, item.paid]), [[today, 30_000, true]]);
  });

  it("can edit, undo and re-record a payment made before the tracked instalments start", async () => {
    const firstInstalment = addDays(today, 20);
    Object.assign(data.loan, { startDate: toDate(firstInstalment), totalOpenAsOf: toDate(firstInstalment) });
    const paid = await createExpense("home", input(100_000));
    assert.equal(data.scheduled().length, 0);
    await updateExpense("home", paid.id, expenseInputSchema.parse({ ...input(40_000), dueDate: today }));
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 60_000);
    await patchExpenseDetails("home", paid.id, { amountCents: 30_000 }, { allowPaidChanges: true });
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 70_000);
    await markExpenseUnpaid("home", paid.id);
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 100_000);
    const repaid = await markExpensePaid("home", paid.id, { paidOn: today });
    assert.equal(repaid.paidOn, today);
    assert.equal(repaid.dueDate, today);
    assert.equal(data.scheduled().reduce((sum, row) => sum + row.amountCents, 0), 70_000);
  });

  it("counts an older extra repayment without subtracting ordinary instalments before the balance start", async () => {
    const paidOn = addDays(asOf, -1);
    data.create({ recurringExpenseId: "loan-1", dueDate: toDate(paidOn), paidOn: toDate(paidOn), amountCents: 23000 });
    const paid = await createExpense("home", input(30_000, { paidOn }));
    assert.equal(paid.paidOn, paidOn);
    assert.equal(data.scheduled().filter((row) => !row.paidOn).reduce((sum, row) => sum + row.amountCents, 0), 70_000);
  });

  it("does not subtract an old repayment again when editing history after resetting the loan balance", async () => {
    const firstInstalment = addDays(today, 20);
    Object.assign(data.loan, { startDate: toDate(firstInstalment), totalOpenAsOf: toDate(firstInstalment) });
    const paid = await createExpense("home", input(30_000));
    Object.assign(data.loan, { totalOpenAsOf: toDate(addDays(firstInstalment, 40)), totalOpenCents: 10_000 });
    await updateExpense("home", paid.id, expenseInputSchema.parse({ ...input(30_000), dueDate: today, notes: "Payment proof received" }));
    const detail = await getRecurringExpenseDetail("home", data.loan.id);
    assert.equal(detail.recurring.totalOpen?.remainingCents, 10_000);
    assert.equal(data.rows().find((row) => row.id === paid.id)?.dueDate.toISOString().slice(0, 10), firstInstalment);
  });

  it("explains a future payment date with the actual limit in dd/mm/yyyy", async () => {
    await assert.rejects(createExpense("home", input(1000, { paidOn: addDays(today, 1) })), (error: unknown) => {
      assert.ok(error instanceof HttpError);
      const message = error.fields?.paidOn?.[0] ?? "";
      assert.match(message, /cannot be in the future/);
      assert.ok(message.includes(formatDate(today, "en")));
      assert.equal(message.includes("as-of"), false);
      return true;
    });
  });

  it("rejects other households, untracked balances, future dates and overpayments", async () => {
    await assert.rejects(createExpense("other-home", input(1000)), (error: unknown) => error instanceof HttpError && error.status === 404);
    await assert.rejects(createExpense("home", input(100_001)), (error: unknown) => error instanceof HttpError && Boolean(error.fields?.amountCents));
    await assert.rejects(createExpense("home", input(1000, { paidOn: "2999-01-01" })), (error: unknown) => error instanceof HttpError && Boolean(error.fields?.paidOn));
    data.loan.totalOpenCents = null;
    await assert.rejects(createExpense("home", input(1000)), (error: unknown) => error instanceof HttpError && Boolean(error.fields?.earlyRepaymentForId));
    assert.equal(data.rows().length, 0);
  });
});
