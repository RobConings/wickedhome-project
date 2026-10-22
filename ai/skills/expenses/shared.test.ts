/**
 * The finance skills' translation helpers (ai/skills/expenses/shared.ts, ai/skills/money/coverage.ts) and
 * the rules of their tools. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/expenses/shared.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Expense } from "@/features/expenses/types/expenses";
import type { ContributionRow, MoneyMonth } from "@/features/money/types/money";
import { pickCandidate } from "@ai/core/resolve";
import { getAssistantSkill } from "@ai/core/skills";
import { listAssistantTools } from "@ai/core/tools";
import "@ai/skills";
import { balanceOn, defaultAccount, monthCoverage } from "../money/coverage";
import { communicationFields, expenseCandidates, payerFields, paymentInfo, repeatOf, rhythm, rruleFor } from "./shared";

const expense = (over: Partial<Expense>): Expense =>
  ({
    id: "e1",
    payee: "Fluvius",
    description: null,
    amountCents: 8540,
    recurringExpenseId: null,
    dueDate: "2026-10-07",
    paidOn: null,
    payerType: "joint",
    payerHabitantId: null,
    shares: [],
    paymentMethod: "wire_transfer",
    beneficiaryName: null,
    iban: null,
    bic: null,
    structuredCommunication: null,
    reference: null,
    ...over,
  }) as Expense;

describe("finance helpers", () => {
  it("builds and reads rhythms", () => {
    assert.equal(rruleFor("monthly"), "FREQ=MONTHLY");
    assert.equal(rruleFor("quarterly", { count: 4 }), "FREQ=MONTHLY;INTERVAL=3;COUNT=4");
    assert.equal(rruleFor("yearly", { until: "2027-12-31" }), "FREQ=YEARLY;UNTIL=20271231");
    assert.equal(repeatOf("FREQ=MONTHLY;INTERVAL=6"), "half_yearly");
    assert.equal(rhythm("FREQ=MONTHLY;INTERVAL=3"), "quarterly");
    assert.equal(rhythm("FREQ=MONTHLY;UNTIL=20270205"), "monthly, until 05/02/2027");
    assert.equal(rhythm("FREQ=WEEKLY;INTERVAL=2;COUNT=10"), "every 2 weeks, 10×");
  });

  it("turns who pays into the contract's payer fields", () => {
    assert.deepEqual(payerFields({}, 1000, "rob"), { payerType: "joint", payerHabitantId: null, shares: [] });
    assert.deepEqual(payerFields({ payer: "person" }, 1000, "rob"), { payerType: "person", payerHabitantId: "rob", shares: [] });
    assert.deepEqual(payerFields({ person: { id: "clara" } }, 1000, "rob").payerHabitantId, "clara");
    // One name: the person asking shares with them; equal split is cent-exact, leftover cents to the first.
    assert.deepEqual(payerFields({ splitWith: [{ id: "clara" }] }, 1001, "rob").shares, [
      { habitantId: "rob", amountCents: 501 },
      { habitantId: "clara", amountCents: 500 },
    ]);
    assert.throws(() => payerFields({ payer: "split", splitWith: [{ id: "rob" }] }, 1000, "rob"), /two people/);
    assert.throws(() => payerFields({ payer: "person" }, 1000, null), /who pays/);
    // An edit without payer keeps it; an equal split stays equal for a new amount, others scale.
    const equal = { payerType: "split" as const, payerHabitantId: null, amountCents: 1000, shares: [{ habitantId: "a", amountCents: 500 }, { habitantId: "b", amountCents: 500 }] };
    assert.deepEqual(payerFields({}, 1201, null, equal).shares.map((share) => share.amountCents), [601, 600]);
    const uneven = { ...equal, shares: [{ habitantId: "a", amountCents: 750 }, { habitantId: "b", amountCents: 250 }] };
    assert.deepEqual(payerFields({}, 2000, null, uneven).shares.map((share) => share.amountCents), [1500, 500]);
  });

  it("recognises a structured communication in any notation and refuses a wrong one", () => {
    assert.deepEqual(communicationFields("+++123/4567/89002+++"), { structuredCommunication: "123456789002", reference: null });
    assert.deepEqual(communicationFields("123456789002"), { structuredCommunication: "123456789002", reference: null });
    assert.deepEqual(communicationFields("factuur 2026-118"), { structuredCommunication: null, reference: "factuur 2026-118" });
    assert.deepEqual(communicationFields(""), { structuredCommunication: null, reference: null });
    assert.deepEqual(communicationFields(undefined), {});
    assert.throws(() => communicationFields("+++123/4567/89003+++"), /check digits/);
  });

  it("says explicitly when payment details are missing, so nothing gets invented", () => {
    const missing = paymentInfo(expense({}));
    assert.equal(missing.iban, "not recorded");
    assert.equal(missing.reference, "not recorded");
    const known = paymentInfo(expense({ iban: "BE68539007547034", structuredCommunication: "123456789002" }));
    assert.equal(known.iban, "BE68 5390 0754 7034");
    assert.equal(known.ogm, "+++123/4567/89002+++");
    assert.equal(known.reference, null);
    assert.equal(paymentInfo(expense({ paymentMethod: "direct_debit" })).iban, null);
  });

  it("names the next unpaid payment plainly and the others with their date", () => {
    const list = [
      expense({ id: "paid", recurringExpenseId: "r", dueDate: "2026-09-07", paidOn: "2026-09-06" }),
      expense({ id: "next", recurringExpenseId: "r", dueDate: "2026-10-07" }),
      expense({ id: "later", recurringExpenseId: "r", dueDate: "2026-11-07" }),
      expense({ id: "groceries", payee: "Delhaize", dueDate: "2026-10-01", paidOn: "2026-10-01", category: "groceries" }),
    ];
    const candidates = expenseCandidates(list);
    const pick = (query: string) => {
      const outcome = pickCandidate("expense", "expense", query, candidates, false);
      return outcome.ok ? outcome.entity.id : outcome.error;
    };
    assert.equal(pick("Fluvius"), "next");
    assert.equal(pick("Fluvius 07/11/2026"), "later");
    assert.equal(pick("fluvius 2026-09-07"), "paid");
    assert.equal(pick("Delhaize"), "groceries");
  });
});

describe("money coverage", () => {
  const row = (habitantId: string, plannedCents: number, recordedCents: number): ContributionRow => ({
    habitantId,
    accountId: "joint",
    planId: `plan-${habitantId}`,
    plannedCents,
    plannedDate: "2026-10-01",
    recordedCents,
    remainingCents: Math.max(0, plannedCents - recordedCents),
    entries: [],
    keptExtraCents: 0,
  });
  const month = {
    month: "2026-10",
    today: "2026-10-04",
    accounts: [
      { id: "savings", name: "Spaar", kind: "savings", iban: null, color: "#000", ownerIds: [], isDefault: false, archived: false, balanceCents: 900_000, lastCorrection: null },
      { id: "joint", name: "Gezamenlijk", kind: "joint", iban: null, color: "#000", ownerIds: [], isDefault: true, archived: false, balanceCents: 50_000, lastCorrection: null },
    ],
    accountMonths: [],
    contributions: [row("rob", 100_000, 0), row("clara", 100_000, 100_000)],
    jointCosts: { paidCents: 120_000, toPayCents: 100_000, toPay: [{ date: "2026-10-15", amountCents: 100_000 }] },
    income: { people: [], household: { receivedCents: 0, expectedCents: 0, totalCents: 0, toEnterCount: 0 }, vouchersCents: {} },
  } as unknown as MoneyMonth;

  it("follows the coverage card: joint current accounts only, short with the projection", () => {
    const coverage = monthCoverage(month);
    assert.equal(coverage.status, "short");
    assert.equal(coverage.differenceCents, -20_000);
    assert.equal(coverage.projection?.balanceCents, 50_000);
    assert.equal(coverage.projection?.endCents, 50_000);
    assert.equal(defaultAccount(month.accounts)?.id, "joint");
  });

  it("reads the balance on a day from the month's lines", () => {
    const accountMonth = {
      accountId: "joint",
      openingCents: 1000,
      lines: [
        { date: "2026-10-10", balanceAfterCents: 3000 },
        { date: "2026-10-03", balanceAfterCents: 2000 },
      ],
    } as unknown as MoneyMonth["accountMonths"][number];
    assert.equal(balanceOn(accountMonth, "2026-10-05"), 2000);
    assert.equal(balanceOn(accountMonth, "2026-10-01"), 1000);
  });
});

describe("finance tools", () => {
  const finance = listAssistantTools().filter((tool) => ["expenses", "income", "money", "projects"].includes(tool.skill));

  it("keeps changes for owners and adults, money always confirmed, children out of income and money", () => {
    for (const tool of finance) {
      if (tool.permission === "read") continue;
      assert.deepEqual([...tool.roles].sort(), ["adult", "owner"], `${tool.name} is for owners and adults`);
      assert.equal(tool.confirm, "always", `${tool.name} always asks`);
    }
    for (const name of ["expenses.log", "expenses.add", "expenses.mark_paid", "expenses.delete", "income.record", "money.record_transfer", "money.set_balance", "money.delete_entry", "projects.add_cost"]) {
      assert.equal(finance.find((tool) => tool.name === name)?.permission, "sensitive", `${name} is sensitive`);
    }
    assert.deepEqual(getAssistantSkill("income")?.roles, ["owner", "adult"]);
    assert.deepEqual(getAssistantSkill("money")?.roles, ["owner", "adult"]);
    assert.ok(finance.filter((tool) => tool.skill === "expenses" && tool.permission === "read").every((tool) => tool.roles.includes("child")));
  });
});
