/**
 * Unit tests for expenses: payment references (OGM, IBAN, BIC), the EPC payment QR payload, splits and
 * payer filters, recurrence, the subscription migration mapping, auto-pay selection and calendar items.
 * No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/expenses/expenses.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountFor,
  computeRecurringTotals,
  isEqualSplit,
  matchesPayer,
  nextPerPayer,
  occurrencesPerYear,
  splitEqually,
} from "@/features/expenses/types/expense-calculations";
import {
  EXPENSE_MONTH_END,
  EXPENSE_RRULE_SUPPORT,
  expenseCreateInputSchema,
  rruleSchema,
} from "@/features/expenses/types/expenses";
import { epcAmount, epcPayload } from "@/features/expenses/types/payment-qr";
import {
  formatIban,
  formatStructuredCommunication,
  looksLikeStructuredCommunication,
  normalizeBic,
  normalizeIban,
  normalizeStructuredCommunication,
  structuredCommunicationCheck,
} from "@/features/expenses/types/payment-references";
import { expandRRule, parseRRule } from "@/types/recurrence";
import { isAutoPayDue } from "./auto-pay";
import { expenseCalendarItems, virtualRecurringItems } from "./expenses.calendar";
import { billingCycleRRule, extractPaymentDetails, guessKind, mapPaymentMethod, mapSubscription, nextRenewal, type LegacySubscription } from "./subscription-mapping";

describe("structured communication (OGM/VCS)", () => {
  it("accepts every common notation and stores 12 digits", () => {
    for (const input of ["+++123/4567/89002+++", "***123/4567/89002***", "123/4567/89002", "123456789002", " +++ 123 / 4567 / 89002 +++ "]) {
      assert.equal(normalizeStructuredCommunication(input), "123456789002", input);
    }
  });

  it("uses 97 as check digits when the remainder is 0", () => {
    // 0000000097 % 97 = 0 → check digits 97.
    assert.equal(structuredCommunicationCheck("0000000097"), "97");
    assert.equal(normalizeStructuredCommunication("000/0000/09797"), "000000009797");
    assert.equal(normalizeStructuredCommunication("000/0000/09700"), null);
  });

  it("rejects wrong check digits, wrong lengths and letters", () => {
    for (const input of ["+++123/4567/89003+++", "12345678900", "1234567890022", "+++123/4567/8900A+++", ""]) {
      assert.equal(normalizeStructuredCommunication(input), null, input);
    }
  });

  it("formats 12 digits and recognises text meant as one", () => {
    assert.equal(formatStructuredCommunication("123456789002"), "+++123/4567/89002+++");
    assert.equal(formatStructuredCommunication("abc"), "abc");
    assert.ok(looksLikeStructuredCommunication("+++123/4567/89003+++"));
    assert.ok(looksLikeStructuredCommunication("123/4567/89003"));
    assert.ok(!looksLikeStructuredCommunication("Invoice 2026-104"));
  });
});

describe("IBAN and BIC", () => {
  it("normalises and validates IBANs (mod-97, country length)", () => {
    assert.equal(normalizeIban("be68 5390 0754 7034"), "BE68539007547034");
    assert.equal(normalizeIban("BE68-5390-0754-7034"), "BE68539007547034");
    assert.equal(normalizeIban("NL91ABNA0417164300"), "NL91ABNA0417164300");
    assert.equal(normalizeIban("BE68539007547035"), null, "wrong check");
    assert.equal(normalizeIban("BE6853900754703"), null, "too short for BE");
    assert.equal(normalizeIban("68539007547034"), null, "no country");
  });

  it("shows Belgian IBANs in groups of four", () => {
    assert.equal(formatIban("BE68539007547034"), "BE68 5390 0754 7034");
    assert.equal(formatIban("BE68 5390 0754 7034"), "BE68 5390 0754 7034");
  });

  it("accepts 8 and 11 character BICs", () => {
    assert.equal(normalizeBic("gebabebb"), "GEBABEBB");
    assert.equal(normalizeBic("GKCC BE BB XXX"), "GKCCBEBBXXX");
    assert.equal(normalizeBic("GEBA"), null);
    assert.equal(normalizeBic("GEBABEBB1"), null);
  });
});

describe("EPC payment QR payload", () => {
  const base = { beneficiaryName: "De Watergroep", iban: "BE68 5390 0754 7034", amountCents: 56206 };

  it("puts an OGM in the structured reference field", () => {
    assert.equal(
      epcPayload({ ...base, bic: "gkccbebb", structuredCommunication: "+++123/4567/89002+++", reference: "ignored" }),
      ["BCD", "002", "1", "SCT", "GKCCBEBB", "De Watergroep", "BE68539007547034", "EUR562.06", "", "123456789002"].join("\n"),
    );
  });

  it("puts free text in the remittance field, with an empty BIC", () => {
    assert.equal(
      epcPayload({ ...base, reference: "Invoice\n2026-104" }),
      ["BCD", "002", "1", "SCT", "", "De Watergroep", "BE68539007547034", "EUR562.06", "", "", "Invoice 2026-104"].join("\n"),
    );
  });

  it("drops trailing empty lines and formats amounts", () => {
    assert.equal(epcPayload(base)?.split("\n").length, 8);
    assert.equal(epcAmount(1), "EUR0.01");
    assert.equal(epcAmount(123450), "EUR1234.50");
  });

  it("refuses without name, valid IBAN or a positive amount", () => {
    assert.equal(epcPayload({ ...base, beneficiaryName: " " }), null);
    assert.equal(epcPayload({ ...base, iban: "BE00 0000 0000 0000" }), null);
    assert.equal(epcPayload({ ...base, amountCents: 0 }), null);
  });

  it("truncates the name to 70 characters", () => {
    const payload = epcPayload({ ...base, beneficiaryName: "x".repeat(90) });
    assert.equal(payload?.split("\n")[5]?.length, 70);
  });
});

describe("splits and payers", () => {
  it("splits equally, cent-exact, leftover cents to the first", () => {
    assert.deepEqual(splitEqually(1000, ["a", "b", "c"]), [
      { habitantId: "a", amountCents: 334 },
      { habitantId: "b", amountCents: 333 },
      { habitantId: "c", amountCents: 333 },
    ]);
    assert.equal(splitEqually(1001, ["a", "b"]).reduce((sum, share) => sum + share.amountCents, 0), 1001);
    assert.deepEqual(splitEqually(500, []), []);
    assert.ok(isEqualSplit(1000, splitEqually(1000, ["a", "b", "c"])));
    assert.ok(!isEqualSplit(1000, [{ habitantId: "a", amountCents: 600 }, { habitantId: "b", amountCents: 400 }]));
  });

  const joint = { payerType: "joint" as const, payerHabitantId: null, shares: [], amountCents: 1000, dueDate: "2026-10-05" };
  const rob = { payerType: "person" as const, payerHabitantId: "h1", shares: [], amountCents: 500, dueDate: "2026-10-03" };
  const split = {
    payerType: "split" as const,
    payerHabitantId: null,
    shares: [{ habitantId: "h1", amountCents: 300 }, { habitantId: "h2", amountCents: 700 }],
    amountCents: 1000,
    dueDate: "2026-10-04",
  };

  it("filters on joint or a person (own and split ones)", () => {
    assert.ok(matchesPayer(joint, "joint") && !matchesPayer(rob, "joint"));
    assert.ok(matchesPayer(rob, { habitantId: "h1" }) && matchesPayer(split, { habitantId: "h2" }));
    assert.ok(!matchesPayer(joint, { habitantId: "h1" }));
    assert.equal(amountFor(split, "h2"), 700);
    assert.equal(amountFor(rob, "h2"), 0);
  });

  it("finds the next expense for the joint account and per person", () => {
    const next = nextPerPayer([rob, split, joint], ["h1", "h2", "h3"]);
    assert.equal(next.joint, joint);
    assert.equal(next.byHabitant.h1, rob);
    assert.equal(next.byHabitant.h2, split);
    assert.equal(next.byHabitant.h3, null);
  });

  it("validates the payer and drops what doesn't belong to it", () => {
    const input = { payee: "Fluvius", amountCents: 1000, dueDate: "2026-10-05", category: "energy" };
    assert.ok(!expenseCreateInputSchema.safeParse({ ...input, payerType: "person" }).success, "person without habitant");
    assert.ok(!expenseCreateInputSchema.safeParse({ ...input, payerType: "split", shares: [{ habitantId: "h1", amountCents: 999 }, { habitantId: "h2", amountCents: 0 }] }).success, "shares off by a cent");
    const parsed = expenseCreateInputSchema.parse({ ...input, payerType: "joint", payerHabitantId: "h1", shares: [{ habitantId: "h1", amountCents: 1000 }] });
    assert.equal(parsed.payerHabitantId, null);
    assert.deepEqual(parsed.shares, []);
    assert.ok(!expenseCreateInputSchema.safeParse({ ...input, structuredCommunication: "123456789002", reference: "x" }).success, "both communications");
    assert.ok(!expenseCreateInputSchema.safeParse({ ...input, reference: "+++123/4567/89003+++" }).success, "mistyped OGM as free text");
  });
});

describe("recurrence", () => {
  it("accepts weekly, monthly and yearly rules with an end; rejects the rest", () => {
    for (const text of ["FREQ=MONTHLY", "FREQ=MONTHLY;INTERVAL=3", "FREQ=YEARLY", "FREQ=WEEKLY;INTERVAL=2", "FREQ=MONTHLY;UNTIL=20271231", "FREQ=MONTHLY;COUNT=12"]) {
      assert.ok(rruleSchema.safeParse(text).success, text);
    }
    for (const text of ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO"]) assert.ok(!rruleSchema.safeParse(text).success, text);
  });

  it("clamps the 31st to the end of shorter months", () => {
    const rule = parseRRule("FREQ=MONTHLY", EXPENSE_RRULE_SUPPORT);
    assert.ok(rule);
    assert.deepEqual(expandRRule(rule, "2026-01-31", { to: "2026-04-30", monthEnd: EXPENSE_MONTH_END }), [
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("converts rhythms to a year", () => {
    assert.equal(occurrencesPerYear("FREQ=MONTHLY"), 12);
    assert.equal(occurrencesPerYear("FREQ=MONTHLY;INTERVAL=3"), 4);
    assert.equal(occurrencesPerYear("FREQ=WEEKLY;INTERVAL=2"), 26);
    assert.equal(occurrencesPerYear("FREQ=YEARLY"), 1);
    const totals = computeRecurringTotals([
      { status: "active", amountCents: 1000, rrule: "FREQ=MONTHLY", candidateToCancel: true },
      { status: "active", amountCents: 12000, rrule: "FREQ=YEARLY", candidateToCancel: false },
      { status: "paused", amountCents: 5000, rrule: "FREQ=MONTHLY", candidateToCancel: false },
    ]);
    assert.deepEqual(totals, { monthlyCents: 2000, yearlyCents: 24000, activeCount: 2, candidatesYearlyCents: 12000, candidatesCount: 1 });
  });
});

describe("subscription migration mapping", () => {
  const subscription = (patch: Partial<LegacySubscription>): LegacySubscription => ({
    id: "s1",
    name: "Telenet",
    websiteUrl: null,
    costCents: 3783,
    billingCycle: "MONTHLY",
    cycleMonths: null,
    nextRenewalOn: "2026-10-12",
    paymentMethod: null,
    ownerId: null,
    status: "ACTIVE",
    trialEndsOn: null,
    remindDaysBefore: null,
    candidateToCancel: false,
    notes: null,
    paymentAccountId: null,
    ...patch,
  });

  it("maps billing cycles to RRULEs", () => {
    assert.equal(billingCycleRRule("WEEKLY"), "FREQ=WEEKLY");
    assert.equal(billingCycleRRule("MONTHLY"), "FREQ=MONTHLY");
    assert.equal(billingCycleRRule("QUARTERLY"), "FREQ=MONTHLY;INTERVAL=3");
    assert.equal(billingCycleRRule("YEARLY"), "FREQ=YEARLY");
    assert.equal(billingCycleRRule("MONTHS", 6), "FREQ=MONTHLY;INTERVAL=6");
    assert.equal(billingCycleRRule("MONTHS", 1), "FREQ=MONTHLY");
    for (const cycle of ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const) assert.ok(rruleSchema.safeParse(billingCycleRRule(cycle)).success);
  });

  it("rolls a past renewal forward to the next one on or after today", () => {
    assert.equal(nextRenewal("2026-10-01", "MONTHLY", null, "2026-10-03"), "2026-11-01");
    assert.equal(nextRenewal("2026-10-03", "MONTHLY", null, "2026-10-03"), "2026-10-03");
    assert.equal(nextRenewal("2026-01-31", "MONTHLY", null, "2026-02-10"), "2026-02-28");
  });

  it("maps free-text payment methods when clear, otherwise OTHER with the text kept", () => {
    assert.deepEqual(mapPaymentMethod("Domiciliëring"), { method: "direct_debit", unmatched: null });
    assert.deepEqual(mapPaymentMethod("domiciliering"), { method: "direct_debit", unmatched: null });
    assert.deepEqual(mapPaymentMethod("Domicilie"), { method: "direct_debit", unmatched: null });
    assert.deepEqual(mapPaymentMethod("Overschrijving"), { method: "wire_transfer", unmatched: null });
    assert.deepEqual(mapPaymentMethod("Visa"), { method: "card", unmatched: null });
    assert.deepEqual(mapPaymentMethod("  "), { method: null, unmatched: null });
    assert.deepEqual(mapPaymentMethod("Via oom Jef"), { method: "other", unmatched: "Via oom Jef" });
  });

  it("only labels loans, down payments and insurance when the name says so", () => {
    assert.equal(guessKind("Afbetaling: Mozenno"), "down_payment");
    assert.equal(guessKind("Afbetaling : CompactCode"), "down_payment");
    assert.equal(guessKind("Lening : huis"), "loan");
    assert.equal(guessKind("Ag insurance : brandverzekering"), "insurance");
    assert.equal(guessKind("Luminus"), "subscription");
    assert.equal(guessKind("Telenet"), "subscription");
  });

  it("maps owner, status, trial, reminder, website and notes", () => {
    const mapped = mapSubscription(
      subscription({
        name: "Lening : huis",
        nextRenewalOn: "2026-10-01",
        ownerId: "h1",
        paymentMethod: "Domicilie",
        remindDaysBefore: 1,
        candidateToCancel: true,
        websiteUrl: "https://bank.be",
        notes: "Vaste rente",
      }),
      "2026-10-03",
    );
    assert.equal(mapped.kind, "loan");
    assert.equal(mapped.category, "loans");
    assert.equal(mapped.startDate, "2026-11-01");
    assert.equal(mapped.payerType, "person");
    assert.equal(mapped.payerHabitantId, "h1");
    assert.equal(mapped.paymentMethod, "direct_debit");
    assert.equal(mapped.remindDaysBefore, 1);
    assert.equal(mapped.candidateToCancel, true);
    assert.equal(mapped.notes, "Vaste rente");
    assert.equal(mapped.status, "active");

    const cancelled = mapSubscription(subscription({ status: "CANCELLED", paymentMethod: "Cheque" }), "2026-10-03");
    assert.equal(cancelled.status, "ended");
    assert.equal(cancelled.endDate, "2026-10-03");
    assert.equal(cancelled.payerType, "joint");
    assert.equal(cancelled.paymentMethod, "other");
    assert.equal(cancelled.notes, "Payment method: Cheque");
    assert.equal(mapSubscription(subscription({ status: "PAUSED" }), "2026-10-03").status, "paused");
  });

  it("picks an IBAN, an OGM or a 'Mededeling' out of the notes, keeping the notes", () => {
    assert.deepEqual(extractPaymentDetails("BE94 6305 4463 1114\nMededeling : Afbetaling Versdivers"), {
      iban: "BE94630544631114",
      structuredCommunication: null,
      reference: "Afbetaling Versdivers",
    });
    assert.deepEqual(extractPaymentDetails("7AB/83861\nBE29 6792 0034 0564"), {
      iban: "BE29679200340564",
      structuredCommunication: null,
      reference: null,
    });
    assert.deepEqual(extractPaymentDetails("rek BE68539007547034 +++123/4567/89002+++"), {
      iban: "BE68539007547034",
      structuredCommunication: "123456789002",
      reference: null,
    });
    assert.equal(extractPaymentDetails("BE68 5390 0754 7034 Mededeling: factuur 12").iban, "BE68539007547034");
    assert.deepEqual(extractPaymentDetails("50 euro korting werk rob"), { iban: null, structuredCommunication: null, reference: null });
    assert.equal(mapSubscription(subscription({ notes: "BE68 5390 0754 7034" }), "2026-10-03").notes, "BE68 5390 0754 7034");
  });
});

describe("direct debit auto-pay selection", () => {
  const today = "2026-10-03";
  const candidate = { paymentMethod: "direct_debit", dueDate: today, paidOn: null, autoPaidAt: null };

  it("pays unpaid direct debits due today or in the last week", () => {
    assert.ok(isAutoPayDue(candidate, today));
    assert.ok(isAutoPayDue({ ...candidate, dueDate: "2026-09-26" }, today));
  });

  it("leaves future, old, paid, undone and other expenses alone", () => {
    assert.ok(!isAutoPayDue({ ...candidate, dueDate: "2026-10-04" }, today), "future");
    assert.ok(!isAutoPayDue({ ...candidate, dueDate: "2026-09-25" }, today), "older than a week");
    assert.ok(!isAutoPayDue({ ...candidate, paidOn: today }, today), "already paid");
    assert.ok(!isAutoPayDue({ ...candidate, autoPaidAt: "2026-10-03T04:10:00Z" }, today), "auto-paid then undone");
    assert.ok(!isAutoPayDue({ ...candidate, paymentMethod: "wire_transfer" }, today), "transfer");
    assert.ok(!isAutoPayDue({ ...candidate, paymentMethod: null }, today), "not set");
  });
});

describe("expenses calendar source", () => {
  const today = "2026-10-03";

  it("shows each expense on its due date with amount and status", () => {
    const [item] = expenseCalendarItems(
      [{ id: "e1", payee: "Fluvius", amountCents: 12345, dueDate: "2026-10-01", paidOn: null, payerHabitantId: null, shares: [] }],
      today,
    );
    assert.equal(item?.allDay, true);
    assert.equal(item?.start, "2026-10-01");
    assert.equal(item?.kind, "bill");
    // Intl puts a no-break space between the sign and the amount.
    assert.equal((item?.title ?? "").replace(/\s/g, " "), "Fluvius · € 123,45");
    assert.equal(item?.meta?.status, "overdue");
    assert.equal(item?.href, "/expenses/e1");
  });

  it("computes occurrences beyond the generation horizon, without doubles", () => {
    const recurring = {
      id: "r1",
      payee: "Luminus",
      amountCents: 22500,
      rrule: "FREQ=MONTHLY",
      startDate: "2026-01-22",
      endDate: null,
      generatedUntil: "2027-10-03",
      payerHabitantId: null,
      shares: [],
    };
    const items = virtualRecurringItems([recurring], "2027-09-01", "2027-12-31", today);
    assert.deepEqual(items.map((item) => item.start), ["2027-10-22", "2027-11-22", "2027-12-22"]);
    assert.equal(items[0]?.href, "/expenses/recurring/r1");
    assert.equal(items[0]?.id, "recurring:r1:2027-10-22");
    // Inside the horizon the materialised expenses are shown instead.
    assert.deepEqual(virtualRecurringItems([recurring], "2026-10-01", "2026-12-31", today), []);
    // Never after the end date.
    assert.deepEqual(virtualRecurringItems([{ ...recurring, endDate: "2027-10-31" }], "2027-09-01", "2027-12-31", today).length, 1);
  });
});
