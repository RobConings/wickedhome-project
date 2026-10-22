import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";
import { addDays, daysBetween } from "@/types/dates";

/*
 * Linking a mail bill to an expense that already exists (docs/INTEGRATIONS.md, "Linking a mail to an existing
 * expense"). Pure: shared by the API (ranking, applying) and the browser (showing the diff). Categories and
 * kinds are the expenses feature's lowercase values, kept as plain strings so this contract stays standalone.
 */

/** A due date this many days from the mail's (either way) counts as "close". */
export const MATCH_DAYS = 20;
/** Variable bills (energy, water, utilities) still match with an amount this far off (15 %). */
export const VARIABLE_AMOUNT_TOLERANCE = 0.15;
/** Without a due date in the mail, its bill is assumed to be due this long after it arrived. */
export const ASSUMED_DUE_AFTER_DAYS = 14;
/** From this score a match is shown as "Looks like …" and its Link button is the main action. */
export const STRONG_MATCH_SCORE = 65;
/** How many ranked matches a suggestion carries. */
export const MAX_MATCHES = 5;

const VARIABLE_CATEGORIES = new Set(["energy", "water"]);
const VARIABLE_KINDS = new Set(["utility"]);

/** An expense, or an occurrence of a recurring expense that has no row yet (created when it is linked). */
export type MailLinkTarget = {
  /** `null`: a recurring expense's occurrence that doesn't exist yet (beyond the generated horizon). */
  expenseId: string | null;
  recurringExpenseId: string | null;
  payee: string;
  /** Lowercase expense category. */
  category: string;
  /** Lowercase kind of its recurring expense; `null` for one-off expenses. */
  kind: string | null;
  dueDate: string;
  amountCents: number;
  paidOn: string | null;
  structuredCommunication: string | null;
  reference: string | null;
  iban: string | null;
  beneficiaryName: string | null;
};

export const MATCH_REASONS = ["ogm", "iban", "payee", "remembered", "date", "amount", "amount_close"] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];

export type MailLinkMatch = MailLinkTarget & {
  score: number;
  reasons: MatchReason[];
  /** Good enough to say "Looks like …". */
  strong: boolean;
};

/** What matching needs from a suggestion and its sender rule. */
export type MailForMatching = {
  payee: string;
  /** The rule's senders (addresses or domains): "luminus.be" also finds an expense called "Luminus". */
  senders: readonly string[];
  /** "Always link mails from this sender to …" (the rule's recurring expense). */
  rememberedRecurringId: string | null;
  amountCents: number | null;
  dueDate: string | null;
  /** `YYYY-MM-DD` the mail arrived. */
  receivedOn: string;
  structuredCommunication: string | null;
  iban: string | null;
};

// ── Names ────────────────────────────────────────────────────────────────────────────────────────────

const LEGAL_WORDS = new Set(["nv", "sa", "bv", "bvba", "srl", "sprl", "cv", "cvba", "vzw", "asbl", "belgium", "belgie", "belgique", "be", "the"]);

/** "ENGIE Electrabel NV" → "engie electrabel": lowercase, no accents or punctuation, no legal forms. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "S.A." → "sa"
    .replace(/\b([a-z])\.(?=[a-z]\b)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !LEGAL_WORDS.has(word))
    .join(" ");
}

/** The name in a sender: "facturen@mail.luminus.be" → "luminus", "engie-electrabel.be" → "engie electrabel". */
export function senderName(sender: string): string {
  const domain = sender.includes("@") ? sender.slice(sender.indexOf("@") + 1) : sender;
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  return normalizeName(labels.length >= 2 ? (labels[labels.length - 2] ?? "") : (labels[0] ?? ""));
}

/** Same payee? Equal after normalising, one starting or ending the other (4+ letters), or a shared word of 4+ letters. */
export function similarNames(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const compactLeft = left.replace(/ /g, "");
  const compactRight = right.replace(/ /g, "");
  if (compactLeft === compactRight) return true;
  const [shorter, longer] = compactLeft.length <= compactRight.length ? [compactLeft, compactRight] : [compactRight, compactLeft];
  if (shorter.length >= 4 && (longer.startsWith(shorter) || longer.endsWith(shorter))) return true;
  // Words, not numbers: "Fluvius 2026" and "Telenet 2026" are different payees.
  const isWord = (word: string) => word.length >= 4 && !/^\d+$/.test(word);
  const words = new Set(left.split(" ").filter(isWord));
  return right.split(" ").some((word) => isWord(word) && words.has(word));
}

const compactIban = (iban: string) => iban.replace(/\s/g, "").toUpperCase();

// ── Ranking ──────────────────────────────────────────────────────────────────────────────────────────

/** The date bills are compared with: the mail's due date, else a guess from when it arrived. */
export const referenceDate = (mail: Pick<MailForMatching, "dueDate" | "receivedOn">) => mail.dueDate ?? addDays(mail.receivedOn, ASSUMED_DUE_AFTER_DAYS);

/** Due dates worth looking at for a mail: [reference − 20 days, reference + 20 days]. */
export function matchWindow(mail: Pick<MailForMatching, "dueDate" | "receivedOn">): { from: string; to: string } {
  const reference = referenceDate(mail);
  return { from: addDays(reference, -MATCH_DAYS), to: addDays(reference, MATCH_DAYS) };
}

/** Energy, water and utility bills vary from one bill to the next. */
export const isVariableBill = (target: Pick<MailLinkTarget, "category" | "kind">) =>
  VARIABLE_CATEGORIES.has(target.category) || (target.kind !== null && VARIABLE_KINDS.has(target.kind));

/**
 * How well one expense fits a mail, or `null` when it doesn't. It needs the same payee (by name, also the
 * sender's domain name, or the beneficiary), the same IBAN or structured communication, or the sender's
 * remembered recurring expense; and the same structured communication, a due date within 20 days, or the
 * amount (exact, or within 15 % for variable bills). Paid expenses are never suggested.
 */
export function scoreTarget(mail: MailForMatching, target: MailLinkTarget): MailLinkMatch | null {
  if (target.paidOn) return null;
  const reasons: MatchReason[] = [];
  let score = 0;

  const ogm = Boolean(mail.structuredCommunication && target.structuredCommunication === mail.structuredCommunication);
  if (ogm) {
    score += 100;
    reasons.push("ogm");
  }
  if (mail.iban && target.iban && compactIban(mail.iban) === compactIban(target.iban)) {
    score += 30;
    reasons.push("iban");
  }
  const names = [mail.payee, ...mail.senders.map(senderName)].filter(Boolean);
  const targetNames = [target.payee, target.beneficiaryName].filter((name): name is string => Boolean(name));
  if (names.some((name) => targetNames.some((other) => similarNames(name, other)))) {
    score += 40;
    reasons.push("payee");
  }
  const remembered = Boolean(mail.rememberedRecurringId && target.recurringExpenseId === mail.rememberedRecurringId);
  if (remembered) {
    // Asked for explicitly: always "Looks like …" on its own.
    score += 70;
    reasons.push("remembered");
  }
  if (reasons.length === 0) return null;

  const distance = Math.abs(daysBetween(referenceDate(mail), target.dueDate));
  const dateClose = distance <= MATCH_DAYS;
  if (dateClose) {
    score += Math.round(25 * (1 - distance / (MATCH_DAYS + 1)));
    reasons.push("date");
  }
  let amountMatch = false;
  if (mail.amountCents !== null) {
    if (mail.amountCents === target.amountCents) {
      score += 30;
      reasons.push("amount");
      amountMatch = true;
    } else if (isVariableBill(target)) {
      const off = Math.abs(mail.amountCents - target.amountCents) / Math.max(target.amountCents, 1);
      if (off <= VARIABLE_AMOUNT_TOLERANCE) {
        score += Math.round(20 * (1 - off / VARIABLE_AMOUNT_TOLERANCE));
        reasons.push("amount_close");
        amountMatch = true;
      }
    }
  }
  if (!ogm && !dateClose && !amountMatch && !remembered) return null;
  return { ...target, score, reasons, strong: score >= STRONG_MATCH_SCORE };
}

/** The matches for a mail, best first (then the nearest due date); at most `limit`. */
export function rankMatches(mail: MailForMatching, targets: readonly MailLinkTarget[], limit = MAX_MATCHES): MailLinkMatch[] {
  const reference = referenceDate(mail);
  const seen = new Set<string>();
  return targets
    .flatMap((target) => {
      const key = target.expenseId ?? `${target.recurringExpenseId}:${target.dueDate}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const match = scoreTarget(mail, target);
      return match ? [match] : [];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Math.abs(daysBetween(reference, a.dueDate)) - Math.abs(daysBetween(reference, b.dueDate)) ||
        a.dueDate.localeCompare(b.dueDate),
    )
    .slice(0, limit);
}

/** The occurrence for a mail: the due date nearest to the mail's (the earlier one on a tie). */
export function pickOccurrence(dueDates: readonly string[], mail: Pick<MailForMatching, "dueDate" | "receivedOn">): string | null {
  const reference = referenceDate(mail);
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const date of [...dueDates].sort()) {
    const distance = Math.abs(daysBetween(reference, date));
    if (distance < bestDistance) {
      best = date;
      bestDistance = distance;
    }
  }
  return best;
}

// ── What linking may change ──────────────────────────────────────────────────────────────────────────

export const MAIL_UPDATE_FIELDS = ["amount", "dueDate", "structuredCommunication", "iban", "beneficiaryName"] as const;
export type MailUpdateField = (typeof MAIL_UPDATE_FIELDS)[number];
/** Template-level fields "Update the recurring expense too" may set. */
export const RECURRING_UPDATE_FIELDS = ["structuredCommunication", "iban", "beneficiaryName"] as const;
export type RecurringUpdateField = (typeof RECURRING_UPDATE_FIELDS)[number];

/** The mail's values that can go onto an expense. */
export type MailValues = Pick<MailForMatching, "payee" | "amountCents" | "dueDate" | "structuredCommunication" | "iban">;

/** One row of the before → after diff. Amounts are cents, dates `YYYY-MM-DD`, OGMs 12 digits. */
export type MailFieldUpdate<F extends string = MailUpdateField> = {
  field: F;
  /** What the expense has now (for the OGM: its free-text reference when it has no OGM). */
  before: string | number | null;
  after: string | number;
  /** Ticked when the dialog opens: amount, due date and OGM of an unpaid expense. */
  defaultOn: boolean;
  /** The expense is paid: changing its amount or due date changes what was paid. */
  paidWarning: boolean;
};

const DEFAULT_ON = new Set<MailUpdateField>(["amount", "dueDate", "structuredCommunication"]);

/** The beneficiary a mail implies: its payee, only when it has an IBAN to pay to. */
const mailBeneficiary = (mail: MailValues) => (mail.iban ? mail.payee.trim() : null);

/**
 * The fields where the mail differs from the expense (nothing for values the mail doesn't have). Amount, due
 * date and OGM start ticked when the expense is unpaid; IBAN and beneficiary never do; a paid expense starts
 * with nothing ticked.
 */
export function proposeUpdates(target: MailLinkTarget, mail: MailValues): MailFieldUpdate[] {
  const paid = target.paidOn !== null;
  const rows: MailFieldUpdate[] = [];
  const add = (field: MailUpdateField, before: string | number | null, after: string | number | null, differs: boolean) => {
    if (after === null || !differs) return;
    rows.push({ field, before, after, defaultOn: !paid && DEFAULT_ON.has(field), paidWarning: paid && (field === "amount" || field === "dueDate") });
  };
  add("amount", target.amountCents, mail.amountCents, mail.amountCents !== target.amountCents);
  add("dueDate", target.dueDate, mail.dueDate, mail.dueDate !== target.dueDate);
  add(
    "structuredCommunication",
    target.structuredCommunication ?? target.reference,
    mail.structuredCommunication,
    mail.structuredCommunication !== target.structuredCommunication,
  );
  add("iban", target.iban, mail.iban, Boolean(mail.iban) && compactIban(mail.iban ?? "") !== compactIban(target.iban ?? ""));
  const beneficiary = mailBeneficiary(mail);
  add("beneficiaryName", target.beneficiaryName, beneficiary, beneficiary !== null && normalizeName(beneficiary) !== normalizeName(target.beneficiaryName ?? target.payee));
  return rows;
}

/** Template fields the mail could fill or correct (the recurring expense's IBAN, OGM, beneficiary). Never ticked. */
export function proposeRecurringUpdates(
  template: Pick<MailLinkTarget, "payee" | "structuredCommunication" | "iban" | "beneficiaryName">,
  mail: MailValues,
): MailFieldUpdate<RecurringUpdateField>[] {
  const rows: MailFieldUpdate<RecurringUpdateField>[] = [];
  const add = (field: RecurringUpdateField, before: string | null, after: string | null, differs: boolean) => {
    if (after !== null && differs) rows.push({ field, before, after, defaultOn: false, paidWarning: false });
  };
  add("structuredCommunication", template.structuredCommunication, mail.structuredCommunication, mail.structuredCommunication !== template.structuredCommunication);
  add("iban", template.iban, mail.iban, Boolean(mail.iban) && compactIban(mail.iban ?? "") !== compactIban(template.iban ?? ""));
  const beneficiary = mailBeneficiary(mail);
  add("beneficiaryName", template.beneficiaryName, beneficiary, beneficiary !== null && normalizeName(beneficiary) !== normalizeName(template.beneficiaryName ?? template.payee));
  return rows;
}

/** Changes for one expense (only what is set changes; an OGM replaces a free-text reference). */
export type ExpenseMailPatch = {
  amountCents?: number;
  dueDate?: string;
  structuredCommunication?: string;
  iban?: string;
  beneficiaryName?: string;
};

/**
 * The patch for the chosen fields, recomputed from the expense as it is now (a field that no longer differs
 * is skipped). Changing the amount or due date of a paid expense needs `allowPaidChanges` (the person saw the
 * warning); otherwise those fields come back in `blocked` and nothing is written for them.
 */
export function buildExpensePatch(
  target: MailLinkTarget,
  mail: MailValues,
  chosen: readonly MailUpdateField[],
  { allowPaidChanges = false }: { allowPaidChanges?: boolean } = {},
): { patch: ExpenseMailPatch; blocked: MailUpdateField[] } {
  const patch: ExpenseMailPatch = {};
  const blocked: MailUpdateField[] = [];
  for (const update of proposeUpdates(target, mail)) {
    if (!chosen.includes(update.field)) continue;
    if (update.paidWarning && !allowPaidChanges) {
      blocked.push(update.field);
      continue;
    }
    if (update.field === "amount") patch.amountCents = Number(update.after);
    else patch[update.field] = String(update.after);
  }
  return { patch, blocked };
}

/** Template changes for the chosen fields (only those that still differ). */
export function buildRecurringPatch(
  template: Pick<MailLinkTarget, "payee" | "structuredCommunication" | "iban" | "beneficiaryName">,
  mail: MailValues,
  chosen: readonly RecurringUpdateField[],
): Partial<Record<RecurringUpdateField, string>> {
  return Object.fromEntries(
    proposeRecurringUpdates(template, mail)
      .filter((update) => chosen.includes(update.field))
      .map((update) => [update.field, String(update.after)]),
  );
}

// ── API contracts ────────────────────────────────────────────────────────────────────────────────────

/** A recurring expense the mail can be linked to (the dialog's "Recurring" list). */
export type MailLinkRecurring = {
  id: string;
  payee: string;
  category: string;
  kind: string;
  /** Lowercase status: active, paused, ended. */
  status: string;
  amountCents: number;
  rrule: string;
  nextDueDate: string | null;
  structuredCommunication: string | null;
  iban: string | null;
  beneficiaryName: string | null;
};

/** `GET …/mail/suggestions/:id/link-options`: everything the link dialog offers. */
export type MailLinkOptions = {
  matches: MailLinkMatch[];
  /** Expenses (unpaid and paid) from a year before to four months after the mail, nearest first. */
  expenses: MailLinkTarget[];
  recurring: MailLinkRecurring[];
  /** The sender rule's remembered recurring expense. */
  rememberedRecurringId: string | null;
};

/** `GET …/mail/suggestions/:id/occurrences?recurringExpenseId=`: occurrences around the mail, `suggested` preselected. */
export type MailOccurrenceOptions = {
  occurrences: MailLinkTarget[];
  /** Due date of the occurrence the app picks for the mail. */
  suggested: string | null;
};

export const mailOccurrenceQuerySchema = z.object({ recurringExpenseId: idSchema });

/** Body of `POST …/mail/suggestions/:id/link`. */
export const mailLinkInputSchema = z.object({
  /** An existing expense, or a recurring expense's occurrence (created when it doesn't exist yet). */
  target: z.union([z.object({ expenseId: idSchema }).strict(), z.object({ recurringExpenseId: idSchema, dueDate: isoDateSchema }).strict()]),
  /** Fields of the expense to take from the mail. */
  apply: z.array(z.enum(MAIL_UPDATE_FIELDS)).max(MAIL_UPDATE_FIELDS.length).default([]),
  /** The person saw that the expense is paid and still changes its amount / due date. */
  allowPaidChanges: z.boolean().default(false),
  /** Template fields to set too (recurring targets only; upcoming unpaid instances follow). */
  updateRecurring: z.array(z.enum(RECURRING_UPDATE_FIELDS)).max(RECURRING_UPDATE_FIELDS.length).default([]),
  /** true: always link this sender's mails to the target's recurring expense; false: forget that; absent: leave. */
  remember: z.boolean().optional(),
});
export type MailLinkInput = z.infer<typeof mailLinkInputSchema>;

/** Answer of `POST …/link`. */
export type MailLinkResult = {
  expenseId: string;
  /** The occurrence didn't exist yet and was created. */
  created: boolean;
  /** The PDF is attached to the expense. */
  attached: boolean;
  /** Fields of the expense that changed. */
  updated: MailUpdateField[];
  /** The suggestion was already linked to this expense (a repeated request): nothing changed. */
  alreadyLinked: boolean;
};

/** `GET …/mail/origins?expenseId=`: which of an expense's documents came from a mail, and when it arrived. */
export type MailDocumentOrigin = { documentFileId: string; receivedAt: string; payee: string };
export const mailOriginsQuerySchema = z.object({ expenseId: idSchema });
