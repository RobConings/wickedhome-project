/**
 * Unit tests for linking mail bills to existing expenses: names, ranking (variable amounts, virtual
 * occurrences, remembered senders), occurrence choice, the before → after diff and its update rules, and the
 * link body. Pure, no database.
 *
 *   npx tsx --test src/api/integrations/mail-matching.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExpensePatch,
  buildRecurringPatch,
  mailLinkInputSchema,
  matchWindow,
  normalizeName,
  pickOccurrence,
  proposeRecurringUpdates,
  proposeUpdates,
  rankMatches,
  referenceDate,
  scoreTarget,
  senderName,
  similarNames,
  type MailForMatching,
  type MailLinkTarget,
} from "@/features/integrations/types/mail-matching";

const OGM = "123456789002";
const IBAN = "BE68539007547034";

const mail = (overrides: Partial<MailForMatching> = {}): MailForMatching => ({
  payee: "Luminus",
  senders: ["luminus.be"],
  rememberedRecurringId: null,
  amountCents: 22_500,
  dueDate: "2026-10-22",
  receivedOn: "2026-10-02",
  structuredCommunication: null,
  iban: null,
  ...overrides,
});

const target = (overrides: Partial<MailLinkTarget> = {}): MailLinkTarget => ({
  expenseId: "e1",
  recurringExpenseId: null,
  payee: "Luminus",
  category: "energy",
  kind: null,
  dueDate: "2026-10-22",
  amountCents: 22_500,
  paidOn: null,
  structuredCommunication: null,
  reference: null,
  iban: null,
  beneficiaryName: null,
  ...overrides,
});

describe("names", () => {
  it("normalises accents, punctuation and legal forms", () => {
    assert.equal(normalizeName("ENGIE Electrabel NV"), "engie electrabel");
    assert.equal(normalizeName("Électricité S.A."), "electricite");
    assert.equal(normalizeName("P&V"), "p v");
  });

  it("reads the name in a sender address or domain", () => {
    assert.equal(senderName("facturen@mail.luminus.be"), "luminus");
    assert.equal(senderName("engie-electrabel.be"), "engie electrabel");
    assert.equal(senderName("fluvius.be"), "fluvius");
  });

  it("finds the same payee written differently", () => {
    assert.ok(similarNames("Luminus", "Luminus energie"));
    assert.ok(similarNames("Engie", "ENGIE Electrabel NV"));
    assert.ok(similarNames("De Watergroep", "Watergroep"));
    assert.ok(similarNames("Water-link", "waterlink"));
    assert.ok(!similarNames("Telenet", "Proximus"));
    assert.ok(!similarNames("Fluvius 2026", "Telenet 2026"), "a shared number is not a shared name");
    // Short names only match exactly.
    assert.ok(similarNames("P&V", "P & V"));
    assert.ok(!similarNames("BASE", "Database Ltd"));
  });
});

describe("ranking", () => {
  it("uses the due date, or a guess two weeks after the mail arrived", () => {
    assert.equal(referenceDate(mail()), "2026-10-22");
    assert.equal(referenceDate(mail({ dueDate: null })), "2026-10-16");
    assert.deepEqual(matchWindow(mail()), { from: "2026-10-02", to: "2026-11-11" });
  });

  it("calls payee + close date + exact amount a strong match", () => {
    const match = scoreTarget(mail(), target({ dueDate: "2026-10-20" }));
    assert.ok(match);
    assert.ok(match.strong);
    assert.deepEqual(match.reasons, ["payee", "date", "amount"]);
  });

  it("finds the payee through the sender's domain or the beneficiary", () => {
    assert.ok(scoreTarget(mail({ payee: "Energieleverancier" }), target({ payee: "luminus" })));
    assert.ok(scoreTarget(mail({ payee: "X", senders: [] }), target({ payee: "Mijn energie", beneficiaryName: "X" })));
  });

  it("accepts variable bills within 15 % but not fixed ones", () => {
    const energy = scoreTarget(mail({ amountCents: 24_100 }), target({ dueDate: "2026-12-01" }));
    assert.ok(energy, "energy 7 % off far from the date still matches on amount");
    assert.ok(energy.reasons.includes("amount_close"));

    const utility = scoreTarget(mail({ amountCents: 24_100 }), target({ category: "other", kind: "utility", dueDate: "2026-12-01" }));
    assert.ok(utility?.reasons.includes("amount_close"));

    const subscription = scoreTarget(mail({ amountCents: 24_100 }), target({ category: "subscriptions", kind: "subscription", dueDate: "2026-12-01" }));
    assert.equal(subscription, null, "a fixed amount must be exact when the date is far");

    const tooFar = scoreTarget(mail({ amountCents: 27_000 }), target({ dueDate: "2026-12-01" }));
    assert.equal(tooFar, null, "20 % off is too much even for energy");
  });

  it("calls a variable bill a strong match on payee, date and a close amount", () => {
    const match = scoreTarget(mail({ amountCents: 23_400 }), target({ dueDate: "2026-10-25" }));
    assert.ok(match?.strong);
  });

  it("needs the same payee, IBAN, OGM or a remembered sender", () => {
    assert.equal(scoreTarget(mail(), target({ payee: "Telenet" })), null);
    assert.ok(scoreTarget(mail(), target({ payee: "Telenet", iban: "BE68 5390 0754 7034" }) as MailLinkTarget) === null);
    const byIban = scoreTarget(mail({ iban: IBAN }), target({ payee: "Telenet", iban: "BE68 5390 0754 7034" }));
    assert.deepEqual(byIban?.reasons.slice(0, 1), ["iban"]);
  });

  it("puts the same structured communication first, whatever the date", () => {
    const matches = rankMatches(mail({ structuredCommunication: OGM }), [
      target({ expenseId: "near", dueDate: "2026-10-22" }),
      target({ expenseId: "ogm", payee: "Iemand anders", dueDate: "2027-03-01", amountCents: 1, structuredCommunication: OGM }),
    ]);
    assert.deepEqual(
      matches.map((match) => match.expenseId),
      ["ogm", "near"],
    );
    assert.ok(matches[0]?.strong);
  });

  it("never suggests paid expenses", () => {
    assert.equal(scoreTarget(mail(), target({ paidOn: "2026-10-01" })), null);
  });

  it("ranks virtual occurrences (no row yet) like expenses and keeps them apart", () => {
    const matches = rankMatches(mail({ amountCents: 23_000 }), [
      target({ expenseId: null, recurringExpenseId: "r1", kind: "utility", dueDate: "2026-10-20", amountCents: 22_500 }),
      target({ expenseId: null, recurringExpenseId: "r1", kind: "utility", dueDate: "2026-10-20", amountCents: 22_500 }),
      target({ expenseId: "one-off", dueDate: "2026-11-10", amountCents: 9_900 }),
    ]);
    assert.equal(matches.length, 2, "the duplicate occurrence counts once");
    assert.equal(matches[0]?.expenseId, null);
    assert.equal(matches[0]?.recurringExpenseId, "r1");
  });

  it("prefers the nearest due date on equal scores", () => {
    const matches = rankMatches(mail({ amountCents: null }), [
      target({ expenseId: "later", dueDate: "2026-11-01" }),
      target({ expenseId: "earlier", dueDate: "2026-10-13" }),
    ]);
    // 10 days later vs 9 days earlier.
    assert.deepEqual(
      matches.map((match) => match.expenseId),
      ["earlier", "later"],
    );
  });

  it("pre-matches the remembered recurring expense even far from the date", () => {
    const remembered = mail({ payee: "Mega", senders: ["mega.be"], rememberedRecurringId: "r9", amountCents: 9_999 });
    const match = scoreTarget(remembered, target({ expenseId: null, recurringExpenseId: "r9", payee: "Elektriciteit thuis", dueDate: "2027-01-05" }));
    assert.ok(match);
    assert.ok(match.reasons.includes("remembered"));
    assert.ok(match.strong);
  });

  it("limits the number of matches", () => {
    const many = Array.from({ length: 9 }, (_, index) => target({ expenseId: `e${index}`, dueDate: `2026-10-${String(10 + index).padStart(2, "0")}` }));
    assert.equal(rankMatches(mail(), many).length, 5);
    assert.equal(rankMatches(mail(), many, 2).length, 2);
  });
});

describe("occurrence choice", () => {
  it("picks the due date nearest to the mail's, the earlier on a tie", () => {
    assert.equal(pickOccurrence(["2026-11-05", "2026-10-05", "2026-12-05"], mail({ dueDate: "2026-10-22" })), "2026-11-05");
    assert.equal(pickOccurrence(["2026-10-12", "2026-11-01"], mail({ dueDate: "2026-10-22" })), "2026-10-12");
    assert.equal(pickOccurrence([], mail()), null);
  });

  it("uses the arrival date when the mail has no due date", () => {
    assert.equal(pickOccurrence(["2026-10-01", "2026-11-01"], mail({ dueDate: null, receivedOn: "2026-10-12" })), "2026-11-01");
  });
});

describe("diff and update rules", () => {
  const values = { payee: "Luminus", amountCents: 23_456, dueDate: "2026-10-25", structuredCommunication: OGM, iban: IBAN };

  it("ticks amount, due date and OGM of an unpaid expense, never IBAN or beneficiary", () => {
    const rows = proposeUpdates(target({ reference: "Factuur 123" }), values);
    assert.deepEqual(
      rows.map((row) => [row.field, row.before, row.after, row.defaultOn]),
      [
        ["amount", 22_500, 23_456, true],
        ["dueDate", "2026-10-22", "2026-10-25", true],
        ["structuredCommunication", "Factuur 123", OGM, true],
        ["iban", null, IBAN, false],
      ],
    );
  });

  it("offers nothing that is already the same", () => {
    const same = target({ amountCents: 23_456, dueDate: "2026-10-25", structuredCommunication: OGM, iban: "be68 5390 0754 7034", beneficiaryName: "LUMINUS NV" });
    assert.deepEqual(proposeUpdates(same, values), []);
  });

  it("offers the beneficiary only with an IBAN, against the payee it falls back to", () => {
    assert.ok(!proposeUpdates(target({ payee: "Energie" }), { ...values, iban: null }).some((row) => row.field === "beneficiaryName"));
    const row = proposeUpdates(target({ payee: "Energie" }), values).find((item) => item.field === "beneficiaryName");
    assert.deepEqual(row && [row.before, row.after, row.defaultOn], [null, "Luminus", false]);
  });

  it("ticks nothing on a paid expense and warns for amount and due date", () => {
    const rows = proposeUpdates(target({ paidOn: "2026-10-20" }), values);
    assert.ok(rows.every((row) => !row.defaultOn));
    assert.deepEqual(
      rows.filter((row) => row.paidWarning).map((row) => row.field),
      ["amount", "dueDate"],
    );
  });

  it("never changes what was paid without the confirmation", () => {
    const paid = target({ paidOn: "2026-10-20" });
    const blocked = buildExpensePatch(paid, values, ["amount", "dueDate", "structuredCommunication"]);
    assert.deepEqual(blocked.blocked, ["amount", "dueDate"]);
    assert.deepEqual(blocked.patch, { structuredCommunication: OGM });
    const confirmed = buildExpensePatch(paid, values, ["amount"], { allowPaidChanges: true });
    assert.deepEqual(confirmed, { patch: { amountCents: 23_456 }, blocked: [] });
  });

  it("only writes the chosen fields, and nothing twice (linking again changes nothing)", () => {
    const first = buildExpensePatch(target(), values, ["amount", "structuredCommunication"]);
    assert.deepEqual(first.patch, { amountCents: 23_456, structuredCommunication: OGM });
    const after = target({ amountCents: 23_456, structuredCommunication: OGM });
    assert.deepEqual(buildExpensePatch(after, values, ["amount", "structuredCommunication"]).patch, {});
  });

  it("offers template fields that are missing or changed, never ticked", () => {
    const template = { payee: "Luminus", structuredCommunication: null, iban: "BE71096123456769", beneficiaryName: "Luminus" };
    const rows = proposeRecurringUpdates(template, values);
    assert.deepEqual(
      rows.map((row) => [row.field, row.before, row.defaultOn]),
      [
        ["structuredCommunication", null, false],
        ["iban", "BE71096123456769", false],
      ],
    );
    assert.deepEqual(buildRecurringPatch(template, values, ["iban", "beneficiaryName"]), { iban: IBAN });
  });
});

describe("link body", () => {
  it("takes an expense or a recurring expense's occurrence, with defaults", () => {
    assert.deepEqual(mailLinkInputSchema.parse({ target: { expenseId: "e1" } }), {
      target: { expenseId: "e1" },
      apply: [],
      allowPaidChanges: false,
      updateRecurring: [],
    });
    const occurrence = mailLinkInputSchema.parse({ target: { recurringExpenseId: "r1", dueDate: "2027-11-05" }, apply: ["amount"], remember: true });
    assert.deepEqual(occurrence.target, { recurringExpenseId: "r1", dueDate: "2027-11-05" });
    assert.equal(occurrence.remember, true);
  });

  it("refuses mixed or unknown targets and fields", () => {
    assert.ok(!mailLinkInputSchema.safeParse({ target: { expenseId: "e1", recurringExpenseId: "r1", dueDate: "2027-11-05" } }).success);
    assert.ok(!mailLinkInputSchema.safeParse({ target: { recurringExpenseId: "r1" } }).success);
    assert.ok(!mailLinkInputSchema.safeParse({ target: { expenseId: "e1" }, apply: ["payee"] }).success);
  });
});
