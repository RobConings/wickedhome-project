import { z } from "zod";
import { isEqualSplit, splitEqually } from "@/features/expenses/types/expense-calculations";
import { EXPENSE_RRULE_SUPPORT, type Expense, type ExpenseShare, type PayerType, type PaymentMethod } from "@/features/expenses/types/expenses";
import {
  formatIban,
  formatStructuredCommunication,
  looksLikeStructuredCommunication,
  normalizeStructuredCommunication,
} from "@/features/expenses/types/payment-references";
import { scaleShares } from "@/features/expenses/types/total-open";
import { parseRRule } from "@/types/recurrence";
import { badRequest } from "@/api/lib/http";
import { day, entityRef, money, type EntityCandidate } from "@ai/core/kit";

/**
 * Pure helpers shared by the finance skills (expenses, income, money, projects): rhythms in words, who pays,
 * payment references, and the candidates of the "expense" resolver. Business rules stay in the features'
 * services and contracts; this only translates between what the model says and their inputs.
 */

/** Finance changes are for owners and adults, like the API's `requireRole("owner", "adult")`. */
export const MONEY_ROLES = ["owner", "adult"] as const;

// ── Rhythm ──────────────────────────────────────────────────────────────────────────────────────────

export const REPEATS = ["weekly", "monthly", "quarterly", "half_yearly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

const REPEAT_RULE: Record<Repeat, string> = {
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  quarterly: "FREQ=MONTHLY;INTERVAL=3",
  half_yearly: "FREQ=MONTHLY;INTERVAL=6",
  yearly: "FREQ=YEARLY",
};

/** An RRULE for a rhythm, optionally ending after `count` payments or on `until` (YYYY-MM-DD). */
export function rruleFor(repeat: Repeat, end: { count?: number | null; until?: string | null } = {}): string {
  const base = REPEAT_RULE[repeat];
  if (end.count) return `${base};COUNT=${end.count}`;
  if (end.until) return `${base};UNTIL=${end.until.replaceAll("-", "")}`;
  return base;
}

/** The rhythm part of an RRULE as a `Repeat`, or null for other intervals. */
export function repeatOf(rrule: string): Repeat | null {
  const rule = parseRRule(rrule, EXPENSE_RRULE_SUPPORT);
  if (!rule) return null;
  const key = `${rule.freq}:${rule.interval}`;
  const map: Record<string, Repeat> = { "WEEKLY:1": "weekly", "MONTHLY:1": "monthly", "MONTHLY:3": "quarterly", "MONTHLY:6": "half_yearly", "YEARLY:1": "yearly" };
  return map[key] ?? null;
}

/** "monthly", "every 3 months, until 05/02/2027", "yearly, 10×". */
export function rhythm(rrule: string): string {
  const rule = parseRRule(rrule, EXPENSE_RRULE_SUPPORT);
  if (!rule) return rrule;
  const n = Math.max(1, rule.interval);
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[rule.freq];
  let text = n === 1 ? { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" }[rule.freq] : n === 3 && unit === "month" ? "quarterly" : `every ${n} ${unit}s`;
  if (rule.until) text += `, until ${day(rule.until)}`;
  else if (rule.count) text += `, ${rule.count}×`;
  return text;
}

// ── Who pays ────────────────────────────────────────────────────────────────────────────────────────

/** The payer arguments of tools that create or change an expense. */
export const payerArgs = {
  payer: z.enum(["joint", "person", "split"]).optional().describe("Who pays: the joint account (default), one person, or split equally"),
  person: entityRef("habitant", "Payer when payer=person (first name or 'me')").optional(),
  splitWith: z.array(entityRef("habitant")).max(10).optional().describe("payer=split: who shares equally; one name means the person asking and that person"),
};

type PayerFields = { payerType: PayerType; payerHabitantId: string | null; shares: ExpenseShare[] };
type PayerChoice = { payer?: PayerType; person?: { id: string }; splitWith?: { id: string }[] };

/**
 * The payer fields for the expenses contract. Nothing chosen: the existing payer (split shares follow a new
 * amount: an equal split stays equal, other splits scale), else the joint account. A named person or a list
 * of people imply "person" or "split".
 */
export function payerFields(choice: PayerChoice, amountCents: number, selfId: string | null, existing?: PayerFields & { amountCents: number }): PayerFields {
  const type: PayerType | undefined = choice.payer ?? (choice.splitWith?.length ? "split" : choice.person ? "person" : undefined);
  if (!type) {
    if (!existing) return { payerType: "joint", payerHabitantId: null, shares: [] };
    if (existing.payerType !== "split" || existing.amountCents === amountCents) return { payerType: existing.payerType, payerHabitantId: existing.payerHabitantId, shares: existing.shares };
    const shares = isEqualSplit(existing.amountCents, existing.shares)
      ? splitEqually(amountCents, existing.shares.map((share) => share.habitantId))
      : scaleShares(existing.shares, existing.amountCents, amountCents);
    return { payerType: "split", payerHabitantId: null, shares };
  }
  if (type === "joint") return { payerType: "joint", payerHabitantId: null, shares: [] };
  if (type === "person") {
    const id = choice.person?.id ?? selfId;
    if (!id) throw badRequest("Say who pays: this account has no person of its own");
    return { payerType: "person", payerHabitantId: id, shares: [] };
  }
  let ids = [...new Set((choice.splitWith ?? []).map((person) => person.id))];
  if (ids.length === 1 && selfId && ids[0] !== selfId) ids = [selfId, ...ids];
  if (ids.length < 2) throw badRequest("A split needs at least two people (splitWith)");
  return { payerType: "split", payerHabitantId: null, shares: splitEqually(amountCents, ids) };
}

/** "joint account", "Clara", "split: Rob € 10,00, Clara € 10,00". */
export function payerText(expense: { payerType: PayerType; payerHabitantId?: string | null; shares: ExpenseShare[] }, names: Map<string, string>): string {
  if (expense.payerType === "person") return names.get(expense.payerHabitantId ?? "") ?? "one person";
  if (expense.payerType === "split") return `split: ${expense.shares.map((share) => `${names.get(share.habitantId) ?? "?"} ${money(share.amountCents)}`).join(", ")}`;
  return "joint account";
}

// ── Payment details ─────────────────────────────────────────────────────────────────────────────────

/**
 * One "communication" argument for both kinds: a valid structured communication (OGM, any notation) becomes
 * `structuredCommunication`, other text a free reference; text that looks like an OGM but fails the check is
 * an error. `undefined` keeps what is there, empty clears both.
 */
export function communicationFields(value: string | null | undefined): { structuredCommunication?: string | null; reference?: string | null } {
  if (value === undefined) return {};
  const text = (value ?? "").trim();
  if (!text) return { structuredCommunication: null, reference: null };
  const digits = normalizeStructuredCommunication(text);
  if (digits) return { structuredCommunication: digits, reference: null };
  if (looksLikeStructuredCommunication(text)) throw badRequest("Invalid structured communication (OGM): the check digits don't match. Ask the person to check it.");
  return { structuredCommunication: null, reference: text };
}

const METHOD_TEXT: Record<PaymentMethod, string> = {
  direct_debit: "direct debit (paid automatically)",
  wire_transfer: "wire transfer",
  card: "card",
  cash: "cash",
  meal_voucher: "meal vouchers",
  other: "other",
};
export const methodText = (method: PaymentMethod | null) => (method ? METHOD_TEXT[method] : "not set");

type PaymentInfo = Pick<Expense, "payee" | "paymentMethod" | "beneficiaryName" | "iban" | "bic" | "structuredCommunication" | "reference">;

/**
 * What someone needs to pay by transfer, exactly as recorded. Missing values say so explicitly, so the model
 * never fills them in itself.
 */
export function paymentInfo(expense: PaymentInfo) {
  const transfer = expense.paymentMethod === "wire_transfer" || expense.paymentMethod === null || expense.paymentMethod === "other";
  return {
    method: methodText(expense.paymentMethod),
    beneficiary: expense.beneficiaryName || expense.payee,
    iban: expense.iban ? formatIban(expense.iban) : transfer ? "not recorded" : null,
    bic: expense.bic,
    ogm: expense.structuredCommunication ? formatStructuredCommunication(expense.structuredCommunication) : null,
    reference: expense.reference ?? (transfer && !expense.structuredCommunication ? "not recorded" : null),
  };
}

// ── The "expense" resolver ──────────────────────────────────────────────────────────────────────────

const expenseName = (expense: Pick<Expense, "payee" | "description">) => (expense.description ? `${expense.payee} – ${expense.description}` : expense.payee);

/**
 * Candidates for naming one expense ("Fluvius", "Fluvius 07/11/2026"). Per recurring expense (or per payee for
 * one-offs) the one people mean without a date gets the plain name: the oldest unpaid one, else the latest paid
 * one. The others carry their due date in the name, so "Fluvius" is never ambiguous and a date picks another.
 */
export function expenseCandidates(expenses: readonly Expense[]): EntityCandidate[] {
  const groups = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const key = expense.recurringExpenseId ?? `payee:${expense.payee.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), expense]);
  }
  const candidates: EntityCandidate[] = [];
  for (const group of groups.values()) {
    const unpaid = group.filter((expense) => !expense.paidOn).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const paid = group.filter((expense) => expense.paidOn).sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? "") || b.dueDate.localeCompare(a.dueDate));
    const primary = unpaid[0] ?? paid[0];
    for (const expense of [...unpaid, ...paid]) {
      const plain = expense === primary;
      const suffix = plain ? "" : ` ${day(expense.dueDate)}`;
      candidates.push({
        id: expense.id,
        name: `${expenseName(expense)}${suffix}`,
        aliases: expense.description ? [`${expense.payee}${suffix}`] : [],
        hint: `${money(expense.amountCents)}, ${expense.paidOn ? `paid ${day(expense.paidOn)}` : `due ${day(expense.dueDate)}`}`,
        date: expense.dueDate,
      });
    }
  }
  return candidates;
}

// ── Confirmation cards ──────────────────────────────────────────────────────────────────────────────

/**
 * A `fields` preview from [label, value] pairs; empty values are left out. Labels come as [en, nl] so every
 * money card reads in the person's language.
 */
export function fieldsPreview(locale: "en" | "nl", title: [string, string], rows: [[string, string], string | null | undefined][]) {
  return {
    kind: "fields",
    title: locale === "nl" ? title[1] : title[0],
    data: { fields: rows.filter(([, value]) => value).map(([label, value]) => ({ label: locale === "nl" ? label[1] : label[0], value: value ?? "" })) },
  };
}
