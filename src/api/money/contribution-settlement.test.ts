/**
 * Unit tests for settling the month's contributions: per person planned vs transferred, what still needs to
 * happen, netting, "take back" (a negative contribution) and "keep as extra", contributions recorded before a
 * correction, and the coverage check (joint costs with recurring, computed and loan occurrences; projection;
 * suggested plans). No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/money/contribution-settlement.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contributionCoverage,
  jointCostsOfMonth,
  personSettlement,
  settleAccount,
  settleContributions,
  splitProportionally,
} from "@/features/money/types/contribution-settlement";
import { absorbedKeys, balanceAt, contributionRows, runLedger, type ContributionInput, type LedgerItem } from "@/features/money/types/money-calculations";
import { directPaymentSchema, keepExtraSchema, planAmountsSchema, takeBackSchema, type ContributionPlan } from "@/features/money/types/money";

const MONTH = "2026-10";
const TODAY = "2026-10-03";
const ROB = "rob";
const CLARA = "clara";
const JOINT = "joint";

const plans: ContributionPlan[] = [
  { id: "plan-clara", habitantId: CLARA, accountId: JOINT, amountCents: 120_000, dayOfMonth: 1, activeFrom: "2026-01-01", activeTo: null, note: null },
  { id: "plan-rob", habitantId: ROB, accountId: JOINT, amountCents: 145_000, dayOfMonth: 1, activeFrom: "2026-01-01", activeTo: null, note: null },
];

const contribution = (habitantId: string, date: string, amountCents: number, fields: Partial<ContributionInput> = {}): ContributionInput => ({
  habitantId,
  accountId: JOINT,
  date,
  amountCents,
  ...fields,
});

const person = (rows: ReturnType<typeof contributionRows>, habitantId: string) => {
  const row = rows.find((item) => item.habitantId === habitantId);
  assert.ok(row, `row for ${habitantId}`);
  return personSettlement(row);
};

describe("settling contributions", () => {
  it("one over, one short: what to do, the netting alternative and the end result", () => {
    const rows = contributionRows(plans, [contribution(CLARA, "2026-10-01", 200_000)], MONTH);
    const clara = person(rows, CLARA);
    const rob = person(rows, ROB);
    assert.deepEqual([clara.status, clara.differenceCents, clara.overCents], ["over", 80_000, 80_000]);
    assert.deepEqual([rob.status, rob.differenceCents, rob.shortCents], ["short", -145_000, 145_000]);

    const settlement = settleAccount(JOINT, rows);
    assert.equal(settlement.settled, false);
    assert.deepEqual(settlement.steps, [
      { kind: "transfer", habitantId: ROB, accountId: JOINT, amountCents: 145_000, date: "2026-10-01" },
      { kind: "take-back", habitantId: CLARA, accountId: JOINT, amountCents: 80_000 },
    ]);
    // Rob pays Clara € 800 directly and transfers € 650 to the joint account.
    assert.deepEqual(settlement.netting, {
      direct: [{ fromHabitantId: ROB, toHabitantId: CLARA, amountCents: 80_000 }],
      steps: [{ kind: "transfer", habitantId: ROB, accountId: JOINT, amountCents: 65_000, date: "2026-10-01" }],
    });
    assert.deepEqual(settlement.endResult, [
      { habitantId: CLARA, amountCents: 120_000 },
      { habitantId: ROB, amountCents: 145_000 },
    ]);
    assert.equal(settlement.totalCents, 265_000);
  });

  it("everyone done: settled, no netting", () => {
    const rows = contributionRows(plans, [contribution(CLARA, "2026-10-01", 120_000), contribution(ROB, "2026-10-02", 145_000)], MONTH);
    const [settlement] = settleContributions(rows);
    assert.ok(settlement);
    assert.equal(settlement.settled, true);
    assert.equal(settlement.netting, null);
    assert.deepEqual(settlement.people.map((item) => item.status), ["done", "done"]);
  });

  it("both short: two transfers, nothing to net", () => {
    const rows = contributionRows(plans, [contribution(ROB, "2026-10-01", 50_000)], MONTH);
    const settlement = settleAccount(JOINT, rows);
    assert.equal(settlement.netting, null);
    assert.deepEqual(
      settlement.steps.map((step) => [step.kind, step.habitantId, step.amountCents]),
      [
        ["transfer", CLARA, 120_000],
        ["transfer", ROB, 95_000],
      ],
    );
  });

  it("nets two people over against one short, largest first", () => {
    const three: ContributionPlan[] = [
      ...plans,
      { id: "plan-x", habitantId: "x", accountId: JOINT, amountCents: 10_000, dayOfMonth: 1, activeFrom: "2026-01-01", activeTo: null, note: null },
    ];
    const rows = contributionRows(three, [contribution(CLARA, "2026-10-01", 150_000), contribution("x", "2026-10-01", 30_000)], MONTH);
    const settlement = settleAccount(JOINT, rows);
    assert.deepEqual(settlement.netting?.direct, [
      { fromHabitantId: ROB, toHabitantId: CLARA, amountCents: 30_000 },
      { fromHabitantId: ROB, toHabitantId: "x", amountCents: 20_000 },
    ]);
    assert.deepEqual(settlement.netting?.steps.map((step) => [step.kind, step.habitantId, step.amountCents]), [["transfer", ROB, 95_000]]);
  });

  it("keep as extra: the kept part is no longer flagged, the rest is", () => {
    const entries = [contribution(CLARA, "2026-10-01", 200_000), contribution(ROB, "2026-10-01", 145_000)];
    const all = contributionRows(plans, entries, MONTH, [{ habitantId: CLARA, accountId: JOINT, month: MONTH, amountCents: 80_000 }]);
    const kept = person(all, CLARA);
    assert.deepEqual([kept.status, kept.keptExtraCents, kept.overCents, kept.transferredCents], ["done", 80_000, 0, 200_000]);
    const settlement = settleAccount(JOINT, all);
    assert.equal(settlement.settled, true);
    assert.equal(settlement.totalCents, 345_000, "the extra stays on the account");

    const part = person(contributionRows(plans, entries, MONTH, [{ habitantId: CLARA, accountId: JOINT, month: MONTH, amountCents: 30_000 }]), CLARA);
    assert.deepEqual([part.status, part.overCents], ["over", 50_000]);
    // Another month's extra doesn't apply.
    const other = person(contributionRows(plans, entries, MONTH, [{ habitantId: CLARA, accountId: JOINT, month: "2026-09", amountCents: 80_000 }]), CLARA);
    assert.equal(other.status, "over");
  });
});

// ── Ledger effects ──────────────────────────────────────────────────────────────────────────────────

let seq = 0;
function line(fields: Partial<LedgerItem> & Pick<LedgerItem, "date" | "type" | "amountCents" | "createdAt">): LedgerItem {
  seq += 1;
  return {
    key: `entry:${seq}`,
    source: "entry",
    sourceId: String(seq),
    accountId: JOINT,
    setBalanceCents: null,
    habitantId: null,
    counterpartAccountId: null,
    label: null,
    note: null,
    ...fields,
  };
}

/** Opening 1 Sep, then the real balance set on 3 Oct at 08:00. */
const base = () => [
  line({ date: "2026-09-01", type: "correction", amountCents: 0, setBalanceCents: 100_000, createdAt: "2026-09-01T08:00:00Z" }),
  line({ date: "2026-10-03", type: "correction", amountCents: 0, setBalanceCents: 152_000, createdAt: "2026-10-03T08:00:00Z" }),
];

const rowsFromLedger = (lines: ReturnType<typeof runLedger>) => {
  const absorbed = absorbedKeys(lines);
  return contributionRows(
    plans,
    lines
      .filter((item) => item.type === "contribution")
      .map((item) => ({ ...item, id: item.sourceId, absorbed: absorbed.has(item.key) })),
    MONTH,
  );
};

describe("contributions and the balance", () => {
  it("a contribution dated before the latest correction counts for the plan but doesn't change the balance", () => {
    const before = runLedger(base(), TODAY);
    const lines = runLedger(
      [...base(), line({ date: "2026-10-01", type: "contribution", amountCents: 200_000, habitantId: CLARA, createdAt: "2026-10-03T09:00:00Z" })],
      TODAY,
    );
    assert.equal(balanceAt(lines, TODAY), balanceAt(before, TODAY), "balance unchanged");
    const rows = rowsFromLedger(lines);
    const clara = person(rows, CLARA);
    assert.equal(clara.overCents, 80_000);
    assert.equal(clara.entries[0]?.absorbed, true);
  });

  it("take back: a negative contribution after the correction lowers the balance and settles the person", () => {
    const lines = runLedger(
      [
        ...base(),
        line({ date: "2026-10-01", type: "contribution", amountCents: 200_000, habitantId: CLARA, createdAt: "2026-10-03T09:00:00Z" }),
        line({ date: "2026-10-03", type: "contribution", amountCents: -80_000, habitantId: CLARA, createdAt: "2026-10-03T10:00:00Z" }),
      ],
      TODAY,
    );
    assert.equal(balanceAt(lines, TODAY), 152_000 - 80_000, "balance − € 800");
    const rows = rowsFromLedger(lines);
    const clara = person(rows, CLARA);
    assert.deepEqual([clara.status, clara.transferredCents], ["done", 120_000]);
    assert.deepEqual(clara.entries.map((entry) => [entry.amountCents, entry.absorbed]), [
      [200_000, true],
      [-80_000, false],
    ]);
    const settlement = settleAccount(JOINT, rows);
    assert.deepEqual(settlement.steps.map((step) => [step.kind, step.habitantId, step.amountCents]), [["transfer", ROB, 145_000]]);
  });

  it("a direct payment between two people moves the net amounts, not the balance", () => {
    const lines = runLedger(
      [
        ...base(),
        line({ date: "2026-10-01", type: "contribution", amountCents: 200_000, habitantId: CLARA, createdAt: "2026-10-03T09:00:00Z" }),
        line({ date: "2026-10-03", type: "contribution", amountCents: 80_000, habitantId: ROB, counterpartHabitantId: CLARA, createdAt: "2026-10-03T10:00:00Z" }),
        line({ date: "2026-10-03", type: "contribution", amountCents: -80_000, habitantId: CLARA, counterpartHabitantId: ROB, createdAt: "2026-10-03T10:00:00Z" }),
      ],
      TODAY,
    );
    assert.equal(balanceAt(lines, TODAY), 152_000);
    const rows = rowsFromLedger(lines);
    assert.equal(person(rows, CLARA).status, "done");
    assert.deepEqual([person(rows, ROB).status, person(rows, ROB).shortCents], ["short", 65_000]);
    assert.equal(person(rows, ROB).entries[0]?.counterpartHabitantId, CLARA);
  });

  it("only lines before the last correction are absorbed", () => {
    const lines = runLedger(
      [...base(), line({ date: "2026-10-03", type: "contribution", amountCents: 10_000, habitantId: ROB, createdAt: "2026-10-03T07:00:00Z" })],
      TODAY,
    );
    const absorbed = absorbedKeys(lines);
    assert.equal(absorbed.size, 2, "the opening correction and the earlier contribution on the same day");
    assert.equal(absorbedKeys(runLedger([line({ date: "2026-10-01", type: "contribution", amountCents: 1, createdAt: "x" })], TODAY)).size, 0);
  });
});

// ── Coverage ────────────────────────────────────────────────────────────────────────────────────────

describe("coverage", () => {
  const flow = [
    { date: "2026-10-02", amountCents: 134_070, paid: true, recurring: true, kind: "utility", virtual: false },
    { date: "2026-10-05", amountCents: 120_000, paid: false, recurring: true, kind: "loan", virtual: false },
    { date: "2026-10-15", amountCents: 98_318, paid: false, recurring: false, kind: null, virtual: false },
    { date: "2026-10-28", amountCents: 45_000, paid: false, recurring: true, kind: "subscription", virtual: true },
    // Overdue from September and next month's: not this month's costs.
    { date: "2026-09-20", amountCents: 9_999, paid: false, recurring: false, kind: null, virtual: false },
    { date: "2026-11-05", amountCents: 120_000, paid: false, recurring: true, kind: "loan", virtual: true },
  ];

  it("joint costs of the month: paid + still to pay, recurring, computed and loan occurrences included", () => {
    const costs = jointCostsOfMonth(flow, MONTH);
    assert.equal(costs.paidCents, 134_070);
    assert.equal(costs.toPayCents, 263_318);
    assert.deepEqual(costs.toPay.map((item) => item.date), ["2026-10-05", "2026-10-15", "2026-10-28"]);
    // A month beyond the generation horizon: only computed occurrences.
    assert.deepEqual(jointCostsOfMonth(flow, "2026-11"), { paidCents: 0, toPayCents: 120_000, toPay: [{ date: "2026-11-05", amountCents: 120_000 }] });
  });

  it("short by € 1.323,88, projection with the date it goes below zero, suggested plans", () => {
    const rows = contributionRows(plans, [contribution(CLARA, "2026-10-01", 200_000)], MONTH);
    const coverage = contributionCoverage({
      month: MONTH,
      today: TODAY,
      people: rows.map(personSettlement),
      costs: jointCostsOfMonth(flow, MONTH),
      balanceCents: 20_000,
      incomes: [
        { habitantId: CLARA, cents: 200_000 },
        { habitantId: ROB, cents: 300_000 },
      ],
    });
    assert.equal(coverage.status, "short");
    assert.equal(coverage.plannedCents, 265_000);
    assert.equal(coverage.costsCents, 397_388);
    assert.equal(coverage.differenceCents, -132_388);
    // € 200 now, + Rob's € 1.450 (planned on the 1st: counted from today), − € 1.200 on 5 Oct, − € 983,18 on 15 Oct: below zero.
    assert.deepEqual(coverage.projection, {
      balanceCents: 20_000,
      toReceiveCents: 145_000,
      toPayCents: 263_318,
      endCents: 20_000 + 145_000 - 263_318,
      lowestCents: 20_000 + 145_000 - 263_318,
      belowZeroOn: "2026-10-15",
    });
    assert.deepEqual(
      coverage.suggestions?.byPlan.map((item) => [item.habitantId, item.suggestedCents]),
      [
        [CLARA, 180_000],
        [ROB, 217_500],
      ],
    );
    assert.deepEqual(
      coverage.suggestions?.byIncome?.map((item) => [item.habitantId, item.suggestedCents]),
      [
        [CLARA, 159_000],
        [ROB, 238_500],
      ],
    );
  });

  it("a future-dated income on the joint account raises the projected end-of-month balance, not today's", () => {
    const rows = contributionRows(plans, [contribution(CLARA, "2026-10-01", 200_000), contribution(ROB, "2026-10-01", 145_000)], MONTH);
    const costs = { paidCents: 0, toPayCents: 30_000, toPay: [{ date: "2026-10-10", amountCents: 30_000 }] };
    const coverage = contributionCoverage({
      month: MONTH,
      today: TODAY,
      people: rows.map(personSettlement),
      costs,
      balanceCents: 20_000,
      incoming: [
        { date: "2026-10-16", amountCents: 23_000 },
        // Already in today's balance (dated today or earlier) or next month: ignored.
        { date: TODAY, amountCents: 99_999 },
        { date: "2026-11-02", amountCents: 99_999 },
      ],
    });
    // € 200 now − € 300 on the 10th (below zero) + € 230 on the 16th.
    assert.deepEqual(coverage.projection, {
      balanceCents: 20_000,
      toReceiveCents: 23_000,
      toPayCents: 30_000,
      endCents: 13_000,
      lowestCents: -10_000,
      belowZeroOn: "2026-10-10",
    });
  });

  it("covered and left over: no suggestions; past months: no projection", () => {
    const rows = contributionRows(plans, [], MONTH);
    const exact = contributionCoverage({ month: MONTH, today: TODAY, people: rows.map(personSettlement), costs: { paidCents: 65_000, toPayCents: 200_000, toPay: [] }, balanceCents: 0 });
    assert.equal(exact.status, "covered");
    assert.equal(exact.suggestions, null);
    const more = contributionCoverage({ month: "2026-09", today: TODAY, people: rows.map(personSettlement), costs: { paidCents: 100_000, toPayCents: 0, toPay: [] }, balanceCents: 0 });
    assert.deepEqual([more.status, more.differenceCents, more.projection], ["left-over", 165_000, null]);
  });

  it("splits proportionally in whole euros that cover the total", () => {
    const parts = splitProportionally(397_388, [120_000, 145_000]);
    assert.ok(parts.reduce((sum, part) => sum + part, 0) >= 397_388);
    assert.ok(parts.every((part) => part % 100 === 0));
    assert.deepEqual(splitProportionally(1_000, [0, 0]), [0, 0]);
  });
});

describe("settlement schemas", () => {
  it("take back, keep extra, direct payment and plan amounts", () => {
    assert.equal(takeBackSchema.safeParse({ habitantId: CLARA, accountId: JOINT, date: TODAY, amountCents: "80000" }).success, true);
    assert.equal(takeBackSchema.safeParse({ habitantId: CLARA, accountId: JOINT, date: TODAY, amountCents: 0 }).success, false);
    assert.equal(keepExtraSchema.safeParse({ habitantId: CLARA, accountId: JOINT, month: MONTH, amountCents: "0" }).success, true);
    assert.equal(directPaymentSchema.safeParse({ fromHabitantId: ROB, toHabitantId: ROB, accountId: JOINT, date: TODAY, amountCents: 1 }).success, false);
    const amounts = planAmountsSchema.parse({ month: MONTH, amounts: JSON.stringify([{ planId: "plan-rob", amountCents: 217_400 }]) });
    assert.deepEqual(amounts.amounts, [{ planId: "plan-rob", amountCents: 217_400 }]);
  });
});
