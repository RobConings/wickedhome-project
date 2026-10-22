/**
 * Unit tests for "total still open" on loans and down payments: the maths (number of payments, partial last
 * payment, settled instances, progress, preview, scaled shares) and instance generation against an
 * in-memory stand-in for the Prisma transaction (partial last instance, the 12-month horizon, recompute
 * after an amount change with paid instances untouched, virtual calendar occurrences stopping after N).
 * No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/expenses/total-open.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recurringExpenseInputSchema } from "@/features/expenses/types/expenses";
import {
  planTotalOpen,
  previewTotalOpen,
  scaleShares,
  splitTotalOpen,
  totalOpenPaidPercent,
  totalOpenPreviewFor,
  totalOpenProgress,
  withUntil,
} from "@/features/expenses/types/total-open";
import type { Prisma } from "../lib/db";
import { generateInstances } from "./expense-instances";
import type { RecurringRow } from "./expense-rows";
import { virtualOccurrences, virtualRecurringItems } from "./expenses.calendar";

describe("total open: number of payments and the partial last one", () => {
  it("splits a total into N payments with a smaller last one", () => {
    assert.deepEqual(splitTotalOpen(85317, 1_000_000), { count: 12, lastCents: 61513 });
  });

  it("has no partial payment when the total divides evenly", () => {
    assert.deepEqual(splitTotalOpen(23000, 230_000), { count: 10, lastCents: 23000 });
  });

  it("makes one payment of the total when it is less than one payment", () => {
    assert.deepEqual(splitTotalOpen(23000, 8000), { count: 1, lastCents: 8000 });
  });

  it("refuses amounts it can't plan", () => {
    assert.equal(splitTotalOpen(0, 1000), null);
    assert.equal(splitTotalOpen(1000, 0), null);
    assert.equal(splitTotalOpen(10.5, 1000), null);
  });
});

describe("total open: plan", () => {
  const loan = { amountCents: 85317, totalOpenCents: 1_000_000, asOf: "2026-11-05", rrule: "FREQ=MONTHLY", startDate: "2025-03-05" };

  it("plans N payments on the rule's dates from the as-of date, the last one partial", () => {
    const plan = planTotalOpen(loan);
    assert.equal(plan.payments.length, 12);
    assert.equal(plan.payments[0]?.dueDate, "2026-11-05");
    assert.deepEqual(plan.payments.at(-1), { dueDate: "2027-10-05", amountCents: 61513 });
    assert.ok(plan.payments.slice(0, 11).every((payment) => payment.amountCents === 85317));
    assert.equal(plan.payments.reduce((sum, payment) => sum + payment.amountCents, 0), 1_000_000);
    assert.equal(plan.lastDate, "2027-10-05");
    assert.equal(plan.remainingCents, 1_000_000);
  });

  it("counts settled instances with their own amounts and skips their dates; earlier ones don't count", () => {
    const plan = planTotalOpen({
      ...loan,
      settled: [
        { dueDate: "2026-10-05", amountCents: 85317 }, // before the as-of date: ignored
        { dueDate: "2026-11-05", amountCents: 100_000 },
        { dueDate: "2026-12-05", amountCents: 85317 },
      ],
    });
    assert.equal(plan.remainingCents, 1_000_000 - 185_317);
    assert.equal(plan.payments[0]?.dueDate, "2027-01-05");
    assert.equal(plan.payments.length, Math.ceil(814_683 / 85317));
    assert.equal(plan.payments.at(-1)?.amountCents, 814_683 - 85317 * 9);
  });

  it("plans only from `from` on (the regeneration window)", () => {
    const plan = planTotalOpen({ ...loan, from: "2027-01-01", settled: [{ dueDate: "2026-11-05", amountCents: 85317 }] });
    assert.equal(plan.payments[0]?.dueDate, "2027-01-05");
    assert.equal(plan.payments.reduce((sum, payment) => sum + payment.amountCents, 0), 1_000_000 - 85317);
  });

  it("ends on the last settled payment when everything is paid", () => {
    const plan = planTotalOpen({ ...loan, totalOpenCents: 100_000, settled: [{ dueDate: "2026-11-05", amountCents: 100_000 }] });
    assert.deepEqual(plan.payments, []);
    assert.equal(plan.lastDate, "2026-11-05");
    assert.equal(plan.remainingCents, 0);
  });

  it("flags more payments than allowed", () => {
    assert.ok(planTotalOpen({ ...loan, amountCents: 1, totalOpenCents: 5000 }).tooMany);
  });

  it("follows the rhythm (quarterly) and the month-end clamp", () => {
    const plan = planTotalOpen({ amountCents: 10000, totalOpenCents: 25000, asOf: "2026-01-31", rrule: "FREQ=MONTHLY;INTERVAL=3", startDate: "2026-01-31" });
    assert.deepEqual(plan.payments, [
      { dueDate: "2026-01-31", amountCents: 10000 },
      { dueDate: "2026-04-30", amountCents: 10000 },
      { dueDate: "2026-07-31", amountCents: 5000 },
    ]);
  });

  it("writes the end as UNTIL, replacing COUNT or an older UNTIL", () => {
    assert.equal(withUntil("FREQ=MONTHLY;COUNT=40", "2027-10-05"), "FREQ=MONTHLY;UNTIL=20271005");
    assert.equal(withUntil("FREQ=MONTHLY;INTERVAL=3;UNTIL=20450101", "2027-10-05"), "FREQ=MONTHLY;INTERVAL=3;UNTIL=20271005");
    assert.equal(withUntil("FREQ=MONTHLY;UNTIL=20450101", null), "FREQ=MONTHLY");
  });
});

describe("total open: progress, preview and shares", () => {
  const base = { amountCents: 85317, totalOpenCents: 1_000_000, asOf: "2026-03-05", rrule: "FREQ=MONTHLY;UNTIL=20270205", startDate: "2025-03-05" };
  const instances = ["03", "04", "05", "06", "07", "08", "09", "10"].map((month) => ({
    dueDate: `2026-${month}-05`,
    amountCents: 85317,
    paid: month !== "10",
  }));

  it("shows what is paid and left, the payments to go and the last one", () => {
    const progress = totalOpenProgress({ ...base, generatedUntil: "2026-10-31", status: "active", instances: [{ dueDate: "2026-02-05", amountCents: 85317, paid: true }, ...instances] });
    assert.equal(progress.paidCount, 7, "the payment before the as-of date doesn't count");
    assert.equal(progress.paidCents, 7 * 85317);
    assert.equal(progress.remainingCents, 402_781);
    assert.equal(progress.paymentsLeft, 5);
    assert.equal(progress.nextDate, "2026-10-05");
    assert.equal(progress.lastDate, "2027-02-05");
    assert.equal(progress.lastAmountCents, 61513);
    assert.equal(totalOpenPaidPercent(progress), 60);
  });

  it("plans nothing more for an ended loan, and says paid off at 0", () => {
    const ended = totalOpenProgress({ ...base, generatedUntil: "2026-10-31", status: "ended", instances });
    assert.equal(ended.paymentsLeft, 1);
    const paidOff = totalOpenProgress({ ...base, totalOpenCents: 7 * 85317, generatedUntil: "2026-10-31", status: "active", instances: instances.filter((item) => item.paid) });
    assert.equal(paidOff.remainingCents, 0);
    assert.equal(paidOff.paymentsLeft, 0);
    assert.equal(totalOpenPaidPercent(paidOff), 100);
  });

  it("previews divisible, partial and smaller-than-one-payment totals for the form", () => {
    const preview = (totalOpenCents: number) =>
      previewTotalOpen({ amountCents: 23000, totalOpenCents, rrule: "FREQ=MONTHLY", startDate: "2026-10-25", from: "2026-10-25" });
    assert.deepEqual(
      { ...preview(230_000), lastDate: preview(230_000)?.lastDate },
      { count: 10, regularCount: 10, regularCents: 23000, lastCents: 23000, lastDate: "2027-07-25", partial: false, paidCents: 0, remainingCents: 230_000, tooMany: false },
    );
    assert.equal(preview(100_000)?.regularCount, 4);
    assert.equal(preview(100_000)?.lastCents, 8000);
    assert.equal(preview(100_000)?.partial, true);
    assert.deepEqual([preview(8000)?.count, preview(8000)?.lastCents, preview(8000)?.lastDate], [1, 8000, "2026-10-25"]);
    assert.equal(previewTotalOpen({ amountCents: null, totalOpenCents: 1000, rrule: "FREQ=MONTHLY", startDate: "2026-10-25", from: "2026-10-25" }), null);
  });

  it("takes off what is paid since the stored as-of date when editing", () => {
    const progress = totalOpenProgress({ ...base, generatedUntil: "2026-10-31", status: "active", instances });
    const same = totalOpenPreviewFor({ amountCents: 90000, totalCents: 1_000_000, asOf: "2026-03-05", rrule: "FREQ=MONTHLY", startDate: "2025-03-05", progress });
    assert.equal(same?.paidCents, 7 * 85317);
    assert.equal(same?.count, Math.ceil(402_781 / 90000));
    const moved = totalOpenPreviewFor({ amountCents: 90000, totalCents: 400_000, asOf: "2026-11-05", rrule: "FREQ=MONTHLY", startDate: "2025-03-05", progress });
    assert.equal(moved?.paidCents, 0);
    assert.equal(moved?.lastDate, "2027-03-05");
  });

  it("scales split shares to the partial payment, cent-exact", () => {
    assert.deepEqual(
      scaleShares([{ habitantId: "a", amountCents: 11500 }, { habitantId: "b", amountCents: 11500 }], 23000, 8001),
      [{ habitantId: "a", amountCents: 4001 }, { habitantId: "b", amountCents: 4000 }],
    );
    const uneven = scaleShares([{ habitantId: "a", amountCents: 30000 }, { habitantId: "b", amountCents: 55317 }], 85317, 61513);
    assert.equal(uneven.reduce((sum, share) => sum + share.amountCents, 0), 61513);
  });

  it("refuses a total that takes more than 999 payments", () => {
    const input = { payee: "Lening", amountCents: 100, category: "loans", startDate: "2026-10-05", rrule: "FREQ=MONTHLY" };
    assert.ok(!recurringExpenseInputSchema.safeParse({ ...input, totalOpenCents: 100_000 }).success);
    assert.ok(recurringExpenseInputSchema.safeParse({ ...input, totalOpenCents: 99_900 }).success);
  });
});

// ── Generation against an in-memory transaction ───────────────────────────────────────────────────────

type Row = { id: string; recurringExpenseId: string; dueDate: Date; amountCents: number; paidOn: Date | null; shares: { habitantId: string; amountCents: number }[] };

/** Just enough of Prisma's transaction client for `generateInstances`. */
function fakeTx(template: RecurringRow) {
  const rows: Row[] = [];
  let next = 1;
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const matches = (row: Row, where: Record<string, unknown>) => {
    if (where.recurringExpenseId !== undefined && row.recurringExpenseId !== where.recurringExpenseId) return false;
    const due = where.dueDate as { in?: Date[]; gte?: Date } | undefined;
    if (due?.in && !due.in.some((date) => day(date) === day(row.dueDate))) return false;
    if (due?.gte && row.dueDate < due.gte) return false;
    if ("paidOn" in where && where.paidOn === null && row.paidOn !== null) return false;
    if (where.shares && row.shares.length > 0) return false;
    return true;
  };
  const tx = {
    expense: {
      findMany: ({ where }: { where: Record<string, unknown> }) => Promise.resolve(rows.filter((row) => matches(row, where))),
      createMany: ({ data }: { data: { recurringExpenseId: string; dueDate: Date; amountCents: number }[] }) => {
        for (const item of data) {
          if (rows.some((row) => row.recurringExpenseId === item.recurringExpenseId && day(row.dueDate) === day(item.dueDate))) continue;
          rows.push({ id: `e${next++}`, recurringExpenseId: item.recurringExpenseId, dueDate: item.dueDate, amountCents: item.amountCents, paidOn: null, shares: [] });
        }
        return Promise.resolve({ count: data.length });
      },
    },
    expenseShare: {
      createMany: ({ data }: { data: { expenseId: string; habitantId: string; amountCents: number }[] }) => {
        for (const share of data) rows.find((row) => row.id === share.expenseId)?.shares.push({ habitantId: share.habitantId, amountCents: share.amountCents });
        return Promise.resolve({ count: data.length });
      },
    },
    recurringExpense: {
      update: ({ data }: { data: Partial<RecurringRow> }) => {
        Object.assign(template, data);
        return Promise.resolve(template);
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, rows, list: () => [...rows].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()) };
}

const date = (value: string) => new Date(`${value}T00:00:00Z`);

function template(patch: Partial<RecurringRow> = {}): RecurringRow {
  return {
    id: "r1",
    householdId: "h1",
    payee: "Lening : huis",
    description: null,
    amountCents: 85317,
    category: "LOANS",
    kind: "LOAN",
    status: "ACTIVE",
    rrule: "FREQ=MONTHLY",
    startDate: date("2026-11-05"),
    endDate: null,
    paymentMethod: "DIRECT_DEBIT",
    beneficiaryName: null,
    iban: null,
    bic: null,
    structuredCommunication: null,
    reference: null,
    payerType: "JOINT",
    payerHabitantId: null,
    notes: null,
    paymentAccountId: null,
    projectId: null,
    generatedUntil: null,
    totalOpenCents: 1_000_000,
    totalOpenAsOf: date("2026-11-05"),
    shares: [],
    project: null,
    ...patch,
  } as unknown as RecurringRow;
}

describe("total open: generating instances", () => {
  it("generates N instances, the last one partial, and stores the end as UNTIL", async () => {
    const recurring = template();
    const { tx, list } = fakeTx(recurring);
    await generateInstances(tx, recurring, "2026-11-05", "2027-11-05");
    const rows = list();
    assert.equal(rows.length, 12);
    assert.equal(rows.at(-1)?.dueDate.toISOString().slice(0, 10), "2027-10-05");
    assert.equal(rows.at(-1)?.amountCents, 61513);
    assert.ok(rows.slice(0, 11).every((row) => row.amountCents === 85317));
    assert.equal(recurring.rrule, "FREQ=MONTHLY;UNTIL=20271005");
  });

  it("leaves the partial last payment beyond the horizon to a later top-up, and the calendar shows it", async () => {
    const recurring = template({ totalOpenCents: 2_000_000 }); // 24 payments: 23 × 853,17 + 377,09
    const { tx, list } = fakeTx(recurring);
    await generateInstances(tx, recurring, "2026-11-05", "2027-11-04");
    assert.equal(list().length, 12);
    assert.ok(list().every((row) => row.amountCents === 85317));
    assert.equal(recurring.rrule, "FREQ=MONTHLY;UNTIL=20281005");

    // Virtual calendar occurrences beyond the horizon: the rest, the last one partial, then nothing.
    const settled = list().map((row) => ({ dueDate: row.dueDate.toISOString().slice(0, 10), amountCents: row.amountCents }));
    const calendarItem = {
      amountCents: 85317,
      rrule: recurring.rrule,
      startDate: "2026-11-05",
      endDate: null,
      generatedUntil: "2027-11-04",
      totalOpen: { totalOpenCents: 2_000_000, asOf: "2026-11-05", settled },
    };
    const virtual = virtualOccurrences(calendarItem, "2027-01-01", "2029-12-31");
    assert.equal(virtual.length, 12);
    assert.deepEqual(virtual.at(-1), { dueDate: "2028-10-05", amountCents: 2_000_000 - 23 * 85317 });
    const items = virtualRecurringItems([{ ...calendarItem, id: "r1", payee: "Lening", payerHabitantId: null, shares: [] }], "2028-09-01", "2028-12-31", "2026-10-03");
    assert.deepEqual(items.map((item) => item.start), ["2028-09-05", "2028-10-05"]);
    assert.equal(items[1]?.meta?.amountCents, 37709);

    // The top-up a year later generates the rest, ending with the partial one.
    await generateInstances(tx, recurring, "2027-11-05", "2028-11-05");
    assert.equal(list().length, 24);
    assert.equal(list().at(-1)?.amountCents, 37709);
    assert.equal(list().reduce((sum, row) => sum + row.amountCents, 0), 2_000_000);
  });

  it("recomputes after an amount change; paid instances keep their amounts", async () => {
    const recurring = template();
    const { tx, rows, list } = fakeTx(recurring);
    await generateInstances(tx, recurring, "2026-11-05", "2027-11-05");
    for (const row of list().slice(0, 3)) row.paidOn = row.dueDate;
    // "This and upcoming": unpaid instances from the cutoff go, the template gets the new amount, regenerate.
    for (let index = rows.length - 1; index >= 0; index--) if (rows[index]?.paidOn === null) rows.splice(index, 1);
    Object.assign(recurring, { amountCents: 100_000 });
    await generateInstances(tx, recurring, "2027-01-06", "2028-01-06");
    const after = list();
    assert.deepEqual(after.slice(0, 3).map((row) => row.amountCents), [85317, 85317, 85317], "paid ones untouched");
    const open = 1_000_000 - 3 * 85317; // 744.049 → 7 × 1.000,00 + 440,49
    assert.equal(after.length, 3 + 8);
    assert.equal(after.at(-1)?.amountCents, open - 7 * 100_000);
    assert.equal(after.reduce((sum, row) => sum + row.amountCents, 0), 1_000_000);
    assert.equal(recurring.rrule, "FREQ=MONTHLY;UNTIL=20270905");
  });

  it("makes one payment when the total is less than one payment, and no partial when it divides", async () => {
    const small = template({ totalOpenCents: 50_000 });
    const one = fakeTx(small);
    await generateInstances(one.tx, small, "2026-11-05", "2027-11-05");
    assert.deepEqual(one.list().map((row) => row.amountCents), [50_000]);

    const even = template({ amountCents: 23000, totalOpenCents: 230_000 });
    const ten = fakeTx(even);
    await generateInstances(ten.tx, even, "2026-11-05", "2027-11-05");
    assert.equal(ten.list().length, 10);
    assert.ok(ten.list().every((row) => row.amountCents === 23000));
  });

  it("generates nothing after an end date, and occurrences before the as-of date at the regular amount", async () => {
    const recurring = template({ startDate: date("2026-09-05"), totalOpenAsOf: date("2026-11-05"), endDate: date("2027-02-28") });
    const { tx, list } = fakeTx(recurring);
    await generateInstances(tx, recurring, "2026-09-05", "2027-09-05");
    assert.deepEqual(list().map((row) => row.dueDate.toISOString().slice(0, 10)), ["2026-09-05", "2026-10-05", "2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"]);
  });

  it("scales split shares on the partial last instance", async () => {
    const recurring = template({
      amountCents: 23000,
      totalOpenCents: 100_000,
      payerType: "SPLIT",
      shares: [
        { id: "s1", recurringExpenseId: "r1", habitantId: "a", amountCents: 11500 },
        { id: "s2", recurringExpenseId: "r1", habitantId: "b", amountCents: 11500 },
      ],
    });
    const { tx, list } = fakeTx(recurring);
    await generateInstances(tx, recurring, "2026-11-05", "2027-11-05");
    const last = list().at(-1);
    assert.equal(last?.amountCents, 8000);
    assert.deepEqual(last?.shares, [{ habitantId: "a", amountCents: 4000 }, { habitantId: "b", amountCents: 4000 }]);
  });
});
