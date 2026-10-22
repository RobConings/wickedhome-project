import type { ExpenseCategory, ExpenseKind, PayerType, PaymentMethod, RecurringStatus } from "@/features/expenses/types/expenses";
import {
  MAX_REFERENCE_LENGTH,
  normalizeIban,
  normalizeStructuredCommunication,
} from "@/features/expenses/types/payment-references";
import { addDays, addMonthsClamped } from "@/types/dates";
import { MAX_INTERVAL } from "@/types/recurrence";

/*
 * Pure mapping of a legacy subscription (the old Subscriptions page, table `subscriptions`) to a recurring
 * expense, used by scripts/migrate-subscriptions-to-expenses.ts. No database access, so it is unit tested.
 */

export type LegacyBillingCycle = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "MONTHS";
export type LegacySubscriptionStatus = "ACTIVE" | "PAUSED" | "CANCELLED";

export type LegacySubscription = {
  id: string;
  name: string;
  websiteUrl: string | null;
  costCents: number;
  billingCycle: LegacyBillingCycle;
  cycleMonths: number | null;
  /** The renewal date as last entered, `YYYY-MM-DD`. */
  nextRenewalOn: string;
  paymentMethod: string | null;
  ownerId: string | null;
  status: LegacySubscriptionStatus;
  trialEndsOn: string | null;
  remindDaysBefore: number | null;
  candidateToCancel: boolean;
  notes: string | null;
  paymentAccountId: string | null;
};

export type MappedRecurringExpense = {
  legacySubscriptionId: string;
  payee: string;
  amountCents: number;
  category: ExpenseCategory;
  kind: ExpenseKind;
  status: RecurringStatus;
  rrule: string;
  /** DTSTART: the next renewal on or after the migration day (no invented history). */
  startDate: string;
  endDate: string | null;
  paymentMethod: PaymentMethod | null;
  /** Found in the notes (`extractPaymentDetails`). */
  iban: string | null;
  structuredCommunication: string | null;
  reference: string | null;
  payerType: PayerType;
  payerHabitantId: string | null;
  websiteUrl: string | null;
  trialEndsOn: string | null;
  remindDaysBefore: number | null;
  candidateToCancel: boolean;
  notes: string | null;
  paymentAccountId: string | null;
};

/** The billing cycle as an RFC 5545 RRULE. */
export function billingCycleRRule(cycle: LegacyBillingCycle, cycleMonths?: number | null): string {
  switch (cycle) {
    case "WEEKLY":
      return "FREQ=WEEKLY";
    case "MONTHLY":
      return "FREQ=MONTHLY";
    case "QUARTERLY":
      return "FREQ=MONTHLY;INTERVAL=3";
    case "YEARLY":
      return "FREQ=YEARLY";
    case "MONTHS": {
      const months = Math.min(MAX_INTERVAL, Math.max(1, cycleMonths ?? 1));
      return months === 1 ? "FREQ=MONTHLY" : `FREQ=MONTHLY;INTERVAL=${months}`;
    }
  }
}

function addCycles(date: string, cycle: LegacyBillingCycle, cycleMonths: number | null, times: number): string {
  switch (cycle) {
    case "WEEKLY":
      return addDays(date, 7 * times);
    case "MONTHLY":
      return addMonthsClamped(date, times);
    case "QUARTERLY":
      return addMonthsClamped(date, 3 * times);
    case "YEARLY":
      return addMonthsClamped(date, 12 * times);
    case "MONTHS":
      return addMonthsClamped(date, Math.max(1, cycleMonths ?? 1) * times);
  }
}

/** The first renewal on or after `today`, counted from the stored date like the old Subscriptions page did. */
export function nextRenewal(renewalOn: string, cycle: LegacyBillingCycle, cycleMonths: number | null, today: string): string {
  let next = renewalOn;
  for (let n = 1; next < today && n < 10_000; n++) next = addCycles(renewalOn, cycle, cycleMonths, n);
  return next;
}

/**
 * The free-text payment method as an enum when it is clear ("Domiciliëring", "Overschrijving", "Visa"…).
 * `unmatched` holds the original text when it isn't (it then goes to the notes, the method becomes OTHER).
 */
export function mapPaymentMethod(text: string | null): { method: PaymentMethod | null; unmatched: string | null } {
  const value = (text ?? "").trim();
  if (!value) return { method: null, unmatched: null };
  const lower = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/domicili|direct ?debit|sepa|domiciliation/.test(lower)) return { method: "direct_debit", unmatched: null };
  if (/overschrijving|overmaking|wire|transfer|virement/.test(lower)) return { method: "wire_transfer", unmatched: null };
  if (/maaltijdcheque|meal ?voucher|titres?[- ]repas|edenred|pluxee|monizze/.test(lower)) {
    return { method: "meal_voucher", unmatched: null };
  }
  if (/visa|mastercard|maestro|bancontact|payconiq|kaart|card|carte|paypal|apple ?pay|google ?pay/.test(lower)) {
    return { method: "card", unmatched: null };
  }
  if (/^(cash|contant|contanten|liquide)$/.test(lower)) return { method: "cash", unmatched: null };
  return { method: "other", unmatched: value };
}

/**
 * The kind only when the name makes it unambiguous ("Afbetaling: …", "Lening : huis", "… verzekering");
 * everything else stays a subscription, for the owner to re-label.
 */
export function guessKind(name: string): ExpenseKind {
  const lower = name.toLowerCase();
  if (/\bafbetaling|\bdown ?payment/.test(lower)) return "down_payment";
  if (/\blening\b|\bkrediet\b|\bloan\b|\bhypothe/.test(lower)) return "loan";
  if (/verzekering|insurance|assurance/.test(lower)) return "insurance";
  return "subscription";
}

const CATEGORY_BY_KIND: Record<ExpenseKind, ExpenseCategory> = {
  subscription: "subscriptions",
  loan: "loans",
  down_payment: "loans",
  insurance: "insurance",
  utility: "energy",
  tax: "taxes",
  other: "other",
};

/**
 * Payment details people typed into a subscription's notes: the first valid IBAN, a valid structured
 * communication, and a "Mededeling: …" / "Communication: …" text as free reference. The notes themselves are
 * kept as they are, so nothing is lost when a guess is wrong.
 */
export function extractPaymentDetails(notes: string | null): {
  iban: string | null;
  structuredCommunication: string | null;
  reference: string | null;
} {
  const text = notes ?? "";
  // A candidate may run into the next word ("BE68 5390 0754 7034 Mededeling"): try its prefixes, longest first.
  const ibanAt = (candidate: string) => {
    const compact = candidate.replace(/ /g, "").toUpperCase();
    for (let length = Math.min(34, compact.length); length >= 15; length--) {
      const iban = normalizeIban(compact.slice(0, length));
      if (iban) return iban;
    }
    return null;
  };
  const iban =
    [...text.matchAll(/\b[A-Z]{2}\d{2}[ A-Z0-9]{11,45}/gi)]
      .map((match) => ibanAt(match[0]))
      .find((value): value is string => value !== null) ?? null;
  const structuredCommunication =
    [...text.matchAll(/(?:\+{3}|\*{3})?\s*\d{3}\s*\/\s*\d{4}\s*\/\s*\d{5}\s*(?:\+{3}|\*{3})?/g)]
      .map((match) => normalizeStructuredCommunication(match[0]))
      .find((value): value is string => value !== null) ?? null;
  const said = /(?:mededeling|communicatie|communication|reference|referentie)\s*:\s*(.+)/i.exec(text)?.[1]?.trim() ?? null;
  const reference = structuredCommunication ? null : said ? said.slice(0, MAX_REFERENCE_LENGTH) : null;
  return { iban, structuredCommunication, reference };
}

/** Maps one subscription. `today` is the migration day in the household time zone. */
export function mapSubscription(subscription: LegacySubscription, today: string): MappedRecurringExpense {
  const kind = guessKind(subscription.name);
  const { method, unmatched } = mapPaymentMethod(subscription.paymentMethod);
  const status: RecurringStatus =
    subscription.status === "CANCELLED" ? "ended" : subscription.status === "PAUSED" ? "paused" : "active";
  const startDate =
    status === "active"
      ? nextRenewal(subscription.nextRenewalOn, subscription.billingCycle, subscription.cycleMonths, today)
      : subscription.nextRenewalOn;
  const notes = [subscription.notes?.trim(), unmatched ? `Payment method: ${unmatched}` : null].filter(Boolean).join("\n");
  const details = extractPaymentDetails(subscription.notes);
  return {
    ...details,
    legacySubscriptionId: subscription.id,
    payee: subscription.name.trim().slice(0, 64),
    amountCents: subscription.costCents,
    category: CATEGORY_BY_KIND[kind],
    kind,
    status,
    rrule: billingCycleRRule(subscription.billingCycle, subscription.cycleMonths),
    startDate,
    endDate: status === "ended" ? today : null,
    paymentMethod: method,
    payerType: subscription.ownerId ? "person" : "joint",
    payerHabitantId: subscription.ownerId,
    websiteUrl: subscription.websiteUrl,
    trialEndsOn: subscription.trialEndsOn,
    remindDaysBefore: subscription.remindDaysBefore,
    candidateToCancel: subscription.candidateToCancel,
    notes: notes || null,
    paymentAccountId: subscription.paymentAccountId,
  };
}
