/**
 * Unit tests for the joint accounts: balance with corrections, paid joint expenses counted (and no longer
 * once unpaid again), which account an expense is taken from, contributions planned vs recorded, and the
 * input schemas. No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/money/money.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountForJointExpense,
  balanceAt,
  contributionRows,
  dayInMonth,
  defaultJointAccount,
  dropBeforeOpening,
  lastCorrectionAt,
  parseTransferFrom,
  runLedger,
  summarizeMonth,
  type LedgerItem,
} from "@/features/money/types/money-calculations";
import { accountCreateSchema, contributionPlanSchema, recordTransferSchema, setBalanceSchema, type ContributionPlan } from "@/features/money/types/money";

const TODAY = "2026-10-02";

let seq = 0;
function item(fields: Partial<LedgerItem> & Pick<LedgerItem, "date" | "type" | "amountCents">): LedgerItem {
  seq += 1;
  return {
    key: `entry:${seq}`,
    source: "entry",
    sourceId: String(seq),
    accountId: "joint",
    setBalanceCents: null,
    habitantId: null,
    counterpartAccountId: null,
    label: null,
    note: null,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    ...fields,
  };
}
const correction = (date: string, balance: number, createdAt?: string) =>
  item({ date, type: "correction", amountCents: 0, setBalanceCents: balance, ...(createdAt ? { createdAt } : {}) });
const expense = (id: string, date: string, cents: number): LedgerItem =>
  item({ key: `expense:${id}`, source: "expense", sourceId: id, date, type: "expense", amountCents: -cents, label: id, createdAt: "" });

describe("ledger balance with corrections", () => {
  it("is the latest correction plus everything after it", () => {
    const lines = runLedger(
      [
        correction("2026-09-01", 100_000),
        item({ date: "2026-09-02", type: "contribution", amountCents: 50_000, habitantId: "rob" }),
        expense("fluvius", "2026-09-10", 12_345),
        correction("2026-09-30", 140_000),
        item({ date: "2026-10-01", type: "contribution", amountCents: 50_000, habitantId: "sofie" }),
      ],
      TODAY,
    );
    assert.equal(balanceAt(lines, TODAY), 190_000);
    assert.equal(balanceAt(lines, "2026-09-15"), 137_655);
    assert.equal(balanceAt(lines, "2026-08-31"), 0);
    // The second correction shows the difference with what the app had just before it.
    const fix = lines.find((line) => line.type === "correction" && line.date === "2026-09-30");
    assert.equal(fix?.amountCents, 140_000 - 137_655);
    assert.equal(fix?.setBalanceCents, 140_000);
    assert.deepEqual(lastCorrectionAt(lines, TODAY), { date: "2026-09-30", balanceCents: 140_000 });
  });

  it("absorbs what was recorded before it on its own day; entries recorded after it still count", () => {
    const lines = runLedger(
      [
        item({ date: "2026-10-02", type: "contribution", amountCents: 1_000, createdAt: "2026-10-02T07:00:00.000Z" }),
        correction("2026-10-02", 50_000, "2026-10-02T08:00:00.000Z"),
        expense("bakker", "2026-10-02", 700),
        item({ date: "2026-10-02", type: "contribution", amountCents: 2_000, createdAt: "2026-10-02T09:00:00.000Z" }),
      ],
      TODAY,
    );
    assert.equal(balanceAt(lines, TODAY), 52_000);
    assert.deepEqual(
      lines.map((line) => line.type),
      ["expense", "contribution", "correction", "contribution"],
    );
  });

  it("counts a computed item of the correction's day that was recorded after it", () => {
    const income = item({ key: "income:tax", source: "income", sourceId: "tax", date: "2026-10-02", type: "income", amountCents: 84_312, createdAt: "2026-10-02T10:00:00.000Z" });
    const paidLater = { ...expense("bakker", "2026-10-02", 700), createdAt: "2026-10-02T11:00:00.000Z" };
    const lines = runLedger([correction("2026-10-02", 50_000, "2026-10-02T08:00:00.000Z"), income, paidLater], TODAY);
    assert.equal(balanceAt(lines, TODAY), 50_000 + 84_312 - 700);
  });

  it("leaves future-dated entries out of today's balance but marks them", () => {
    const lines = runLedger([correction("2026-10-01", 10_000), item({ date: "2026-10-15", type: "contribution", amountCents: 5_000 })], TODAY);
    assert.equal(balanceAt(lines, TODAY), 10_000);
    assert.equal(lines.at(-1)?.future, true);
    assert.equal(balanceAt(lines, "2026-10-31"), 15_000);
  });

  it("summarises a month: opening, closing, in, out and corrections", () => {
    const lines = runLedger(
      [
        correction("2026-09-01", 100_000),
        item({ date: "2026-10-01", type: "contribution", amountCents: 50_000 }),
        expense("proximus", "2026-10-02", 9_000),
        correction("2026-10-02", 140_000, "2026-10-02T23:00:00.000Z"),
      ],
      TODAY,
    );
    const month = summarizeMonth("joint", lines, "2026-10", TODAY);
    assert.equal(month.openingCents, 100_000);
    assert.equal(month.closingCents, 140_000);
    assert.equal(month.inCents, 50_000);
    assert.equal(month.outCents, 9_000);
    assert.equal(month.correctionsCents, -1_000);
    assert.equal(month.lines[0]?.type, "correction");
    assert.deepEqual([month.plannedInCents, month.plannedOutCents], [0, 0]);
  });

  it("a future-dated income (green certificate on the 16th) only raises the balance from its date on", () => {
    const certificate = item({ key: "income:gsc", source: "income", sourceId: "gsc", date: "2026-10-16", type: "income", amountCents: 23_000 });
    const lines = runLedger([correction("2026-10-01", 10_000), certificate, expense("bakker", "2026-10-20", 1_000)], TODAY);
    assert.equal(balanceAt(lines, TODAY), 10_000);
    assert.equal(balanceAt(lines, "2026-10-15"), 10_000);
    assert.equal(balanceAt(lines, "2026-10-16"), 33_000, "today boundary inclusive: on its own date it counts");
    const month = summarizeMonth("joint", lines, "2026-10", TODAY);
    assert.equal(month.closingCents, 10_000);
    assert.deepEqual([month.inCents, month.outCents, month.plannedInCents, month.plannedOutCents], [0, 0, 23_000, 1_000]);
    assert.equal(month.lines.find((line) => line.key === "income:gsc")?.future, true);
    // On the 16th it is money in, no longer planned.
    const onTheDay = summarizeMonth("joint", runLedger([correction("2026-10-01", 10_000), certificate], "2026-10-16"), "2026-10", "2026-10-16");
    assert.deepEqual([onTheDay.closingCents, onTheDay.inCents, onTheDay.plannedInCents], [33_000, 23_000, 0]);
  });
});

describe("paid joint expenses", () => {
  const opening = correction("2026-09-01", 100_000);

  it("lower the balance while paid, and stop counting once unpaid again", () => {
    const paid = [opening, expense("fluvius", "2026-09-12", 14_500), expense("proximus", "2026-09-20", 8_999)];
    assert.equal(balanceAt(runLedger(dropBeforeOpening(paid), TODAY), TODAY), 100_000 - 14_500 - 8_999);
    // "Not paid after all": the expense no longer comes back from listJointPayments.
    const unpaidAgain = paid.filter((line) => line.sourceId !== "proximus");
    assert.equal(balanceAt(runLedger(dropBeforeOpening(unpaidAgain), TODAY), TODAY), 100_000 - 14_500);
  });

  it("paid before the opening balance was set (on or before its day) are already in it", () => {
    const items = dropBeforeOpening([opening, expense("old", "2026-08-30", 5_000), expense("same-day", "2026-09-01", 1_000), expense("after", "2026-09-02", 2_000)]);
    assert.deepEqual(
      items.filter((line) => line.source === "expense").map((line) => line.sourceId),
      ["after"],
    );
    assert.equal(balanceAt(runLedger(items, TODAY), TODAY), 98_000);
  });

  const accounts = [
    { id: "savings", kind: "savings" as const, isDefault: false, archived: false, createdAt: "2026-01-01" },
    { id: "joint-old", kind: "joint" as const, isDefault: false, archived: false, createdAt: "2025-01-01" },
    { id: "joint-main", kind: "joint" as const, isDefault: true, archived: false, createdAt: "2026-02-01" },
  ];

  it("come from their own joint account, else the default joint account", () => {
    assert.equal(accountForJointExpense("savings", accounts), "savings");
    assert.equal(accountForJointExpense(null, accounts), "joint-main");
    assert.equal(accountForJointExpense("someone-elses", accounts), "joint-main");
    assert.equal(defaultJointAccount(accounts.map((account) => ({ ...account, isDefault: false })))?.id, "joint-old");
    assert.equal(accountForJointExpense(null, accounts.slice(0, 1)), null);
  });
});

describe("contributions planned vs recorded", () => {
  const plans: ContributionPlan[] = [
    { id: "p1", habitantId: "rob", accountId: "joint", amountCents: 150_000, dayOfMonth: 31, activeFrom: "2026-01-01", activeTo: "2026-09-30", note: null },
    { id: "p2", habitantId: "rob", accountId: "joint", amountCents: 160_000, dayOfMonth: 31, activeFrom: "2026-10-01", activeTo: null, note: null },
    { id: "p3", habitantId: "sofie", accountId: "joint", amountCents: 150_000, dayOfMonth: 3, activeFrom: "2026-01-01", activeTo: null, note: null },
  ];

  it("compares the plan in force with the recorded transfers of the month", () => {
    const rows = contributionRows(
      plans,
      [
        { habitantId: "rob", accountId: "joint", date: "2026-10-01", amountCents: 100_000 },
        { habitantId: "rob", accountId: "joint", date: "2026-10-15", amountCents: 60_000 },
        { habitantId: "sofie", accountId: "joint", date: "2026-09-03", amountCents: 150_000 },
        { habitantId: "lena", accountId: "savings", date: "2026-10-05", amountCents: 2_000 },
      ],
      "2026-10",
    );
    const rob = rows.find((row) => row.habitantId === "rob");
    assert.deepEqual(
      { planned: rob?.plannedCents, recorded: rob?.recordedCents, remaining: rob?.remainingCents, date: rob?.plannedDate, plan: rob?.planId },
      { planned: 160_000, recorded: 160_000, remaining: 0, date: "2026-10-31", plan: "p2" },
    );
    const sofie = rows.find((row) => row.habitantId === "sofie");
    assert.equal(sofie?.recordedCents, 0);
    assert.equal(sofie?.remainingCents, 150_000);
    // Without a plan: still shown, nothing "to go".
    const lena = rows.find((row) => row.habitantId === "lena");
    assert.deepEqual([lena?.plannedCents, lena?.recordedCents, lena?.remainingCents, lena?.planId], [0, 2_000, 0, null]);
  });

  it("uses the old plan in earlier months and clamps the day", () => {
    const rows = contributionRows(plans, [], "2026-09");
    assert.equal(rows.find((row) => row.habitantId === "rob")?.plannedCents, 150_000);
    assert.equal(rows.find((row) => row.habitantId === "rob")?.plannedDate, "2026-09-30");
    assert.equal(dayInMonth("2027-02", 31), "2027-02-28");
  });
});

describe("money input schemas", () => {
  it("record transfer: from a person or another account, never to itself", () => {
    assert.deepEqual(parseTransferFrom("habitant:h1"), { habitantId: "h1" });
    assert.deepEqual(parseTransferFrom("account:a1"), { accountId: "a1" });
    assert.equal(parseTransferFrom("nobody"), null);
    const base = { toAccountId: "a1", date: TODAY, amountCents: "1500" };
    assert.equal(recordTransferSchema.safeParse({ ...base, from: "habitant:h1" }).success, true);
    assert.equal(recordTransferSchema.safeParse({ ...base, from: "account:a1" }).success, false);
    assert.equal(recordTransferSchema.safeParse({ ...base, from: "account:a2", amountCents: "0" }).success, false);
  });

  it("set balance and opening balance accept zero and a negative switch", () => {
    const zero = setBalanceSchema.parse({ date: TODAY, balanceCents: "0" });
    assert.deepEqual([zero.balanceCents, zero.note, Boolean(zero.negative)], [0, null, false]);
    assert.equal(setBalanceSchema.parse({ date: TODAY, balanceCents: "500", negative: "on" }).negative, true);
    const account = accountCreateSchema.parse({ name: "Joint", kind: "joint", ownerIds: "h1,h2", openingBalanceCents: "800000", openingDate: TODAY, iban: "be68 5390 0754 7034" });
    assert.deepEqual(account.ownerIds, ["h1", "h2"]);
    assert.equal(account.iban, "BE68539007547034");
    assert.equal(accountCreateSchema.safeParse({ name: "Joint", kind: "joint", ownerIds: [], openingBalanceCents: "1", openingDate: TODAY, iban: "nope" }).success, false);
  });

  it("contribution plan: day 1–31, ends after it starts", () => {
    const plan = { habitantId: "h1", accountId: "a1", amountCents: "150000", activeFrom: "2026-10-01" };
    assert.equal(contributionPlanSchema.parse(plan).dayOfMonth, 1);
    assert.equal(contributionPlanSchema.safeParse({ ...plan, dayOfMonth: "32" }).success, false);
    assert.equal(contributionPlanSchema.safeParse({ ...plan, activeTo: "2026-09-30" }).success, false);
  });
});
