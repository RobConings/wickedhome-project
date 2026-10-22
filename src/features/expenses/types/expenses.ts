import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";
import type { ProjectRef } from "@/types/projects";
import { MAX_COUNT, isValidRRule, type MonthEndPolicy, type RRuleSupport } from "@/types/recurrence";
import type { TotalOpenProgress } from "./total-open";
import {
  MAX_REFERENCE_LENGTH,
  looksLikeStructuredCommunication,
  normalizeBic,
  normalizeIban,
  normalizeStructuredCommunication,
} from "./payment-references";

/*
 * Expenses: everything the household pays. A one-off expense is a bill to pay or everyday spending logged
 * as paid; a recurring expense (subscription, loan, down payment, insurance…) is a template whose
 * occurrences are materialised as expenses. See docs/FINANCE.md.
 */

// ── Enumerations ────────────────────────────────────────────────────────────────────────────────────

/** Bills and recurring costs. */
export const BILL_CATEGORIES = [
  "energy",
  "water",
  "internet_phone",
  "insurance",
  "taxes",
  "housing",
  "healthcare",
  "school_childcare",
  "car",
  "subscriptions",
  "loans",
] as const;
/** Everyday spending (the "Log an expense" flow offers these first). */
export const EVERYDAY_CATEGORIES = [
  "groceries",
  "household",
  "eating_out",
  "transport",
  "leisure",
  "gifts",
  "clothing",
  "personal_care",
  "pets",
] as const;
export const EXPENSE_CATEGORIES = [...BILL_CATEGORIES, ...EVERYDAY_CATEGORIES, "other"] as const;
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const EXPENSE_KINDS = ["subscription", "loan", "down_payment", "insurance", "utility", "tax", "other"] as const;
export const expenseKindSchema = z.enum(EXPENSE_KINDS);
export type ExpenseKind = z.infer<typeof expenseKindSchema>;

export const RECURRING_STATUSES = ["active", "paused", "ended"] as const;
export const recurringStatusSchema = z.enum(RECURRING_STATUSES);
export type RecurringStatus = z.infer<typeof recurringStatusSchema>;

export const PAYMENT_METHODS = ["direct_debit", "wire_transfer", "card", "cash", "meal_voucher", "other"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Joint account (the default), one person, or split between persons. */
export const PAYER_TYPES = ["joint", "person", "split"] as const;
export const payerTypeSchema = z.enum(PAYER_TYPES);
export type PayerType = z.infer<typeof payerTypeSchema>;

/** Derived, never stored: follows from the due date and whether the expense is paid. */
export const EXPENSE_STATUSES = ["upcoming", "due", "overdue", "paid"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** An expense counts as "due" from this many days before its due date. */
export const DUE_SOON_DAYS = 7;

/** Largest amount accepted for one expense: € 1 000 000. */
export const MAX_AMOUNT_CENTS = 100_000_000;

// ── Field schemas ───────────────────────────────────────────────────────────────────────────────────

/** Accepts any common notation and stores the 12 digits. */
export const structuredCommunicationSchema = z.string().transform((value, ctx) => {
  const digits = normalizeStructuredCommunication(value);
  if (digits) return digits;
  ctx.issues.push({ code: "custom", message: "Invalid structured communication", input: value });
  return z.NEVER;
});

/** Free text; something that was clearly meant as a structured communication but is wrong is an error. */
export const referenceSchema = z
  .string()
  .trim()
  .max(MAX_REFERENCE_LENGTH)
  .refine((value) => !looksLikeStructuredCommunication(value), "Invalid structured communication");

/** Accepts spaces and lower case and stores the compact upper-case IBAN. */
export const ibanSchema = z.string().transform((value, ctx) => {
  const iban = normalizeIban(value);
  if (iban) return iban;
  ctx.issues.push({ code: "custom", message: "Invalid IBAN", input: value });
  return z.NEVER;
});

export const bicSchema = z.string().transform((value, ctx) => {
  const bic = normalizeBic(value);
  if (bic) return bic;
  ctx.issues.push({ code: "custom", message: "Invalid BIC", input: value });
  return z.NEVER;
});

/** Accepts "netflix.com" as well as a full URL; stores it with https://. */
export const websiteSchema = z
  .string()
  .trim()
  .max(300)
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(z.url({ protocol: /^https?$/ }));

/**
 * Recurring expenses use the shared RRULE module (`@/types/recurrence`) with this subset: weekly, monthly
 * or yearly, with COUNT or UNTIL; no weekdays, no seasons. Occurrences are always computed from the start
 * date, so they never drift.
 */
export const EXPENSE_RRULE_SUPPORT = { frequencies: ["WEEKLY", "MONTHLY", "YEARLY"], byDay: false, seasons: false } as const satisfies RRuleSupport;

/** One deliberate deviation from the RFC: an expense on the 31st falls on the last day of shorter months. */
export const EXPENSE_MONTH_END: MonthEndPolicy = "clamp";

export const rruleSchema = z
  .string()
  .trim()
  .max(200)
  .refine((rule) => isValidRRule(rule, EXPENSE_RRULE_SUPPORT), "Unsupported recurrence rule");

export const expenseShareSchema = z.object({
  habitantId: idSchema,
  amountCents: z.number().int().min(0).max(MAX_AMOUNT_CENTS),
});
export type ExpenseShare = z.infer<typeof expenseShareSchema>;

// ── Input schemas ───────────────────────────────────────────────────────────────────────────────────

/** Payment details and payer: the same on a one-off expense, an instance and a recurring template. */
const paymentFields = {
  /** Also the id under which the payee is remembered for "recently used", hence the 64 limit. */
  payee: z.string().trim().min(1).max(64),
  description: z.string().trim().max(200).optional().nullable(),
  amountCents: z.coerce.number().int().min(1).max(MAX_AMOUNT_CENTS),
  category: expenseCategorySchema,
  paymentMethod: paymentMethodSchema.optional().nullable(),
  /** Account holder for a transfer; the payee when left empty. */
  beneficiaryName: z.string().trim().max(70).optional().nullable(),
  iban: ibanSchema.optional().nullable(),
  bic: bicSchema.optional().nullable(),
  /** Either a structured communication or a free-text reference, not both. */
  structuredCommunication: structuredCommunicationSchema.optional().nullable(),
  reference: referenceSchema.optional().nullable(),
  payerType: payerTypeSchema.default("joint"),
  /** Required for payer "person". */
  payerHabitantId: idSchema.optional().nullable(),
  /** Required for payer "split": one share per habitant, adding up to `amountCents`. */
  shares: z.array(expenseShareSchema).max(20).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** The project it counts towards (projects feature). Left out: an edit keeps it; `null` removes it. */
  projectId: idSchema.optional().nullable(),
};

/** What only a recurring expense has. */
const recurringFields = {
  kind: expenseKindSchema.default("other"),
  websiteUrl: websiteSchema.optional().nullable(),
  trialEndsOn: isoDateSchema.optional().nullable(),
  remindDaysBefore: z.coerce.number().int().min(0).max(90).optional().nullable(),
  candidateToCancel: z.coerce.boolean().default(false),
  /**
   * Loans and down payments: what is still to pay off. When set, the end of the rule follows from it (see
   * `total-open.ts`). Left out: an edit keeps it; `null` removes it (the posted rule applies again).
   */
  totalOpenCents: z.coerce.number().int().min(1).max(MAX_AMOUNT_CENTS).optional().nullable(),
  /** First due date the total open counts from. Empty: the next unpaid due date. */
  totalOpenAsOf: isoDateSchema.optional().nullable(),
};

/** A total open amount must be paid off in at most MAX_COUNT payments of the amount. */
function checkTotalOpen(value: { amountCents: number; totalOpenCents?: number | null }, ctx: z.RefinementCtx) {
  if (value.totalOpenCents && value.amountCents > 0 && Math.ceil(value.totalOpenCents / value.amountCents) > MAX_COUNT) {
    ctx.addIssue({ code: "custom", path: ["totalOpenCents"], message: `More than ${MAX_COUNT} payments` });
  }
}

type PayerFields = {
  amountCents: number;
  payerType: PayerType;
  payerHabitantId?: string | null;
  shares: ExpenseShare[];
  structuredCommunication?: string | null;
  reference?: string | null;
  paymentMethod?: PaymentMethod | null;
};

/** Meal vouchers belong to a person: an expense paid with them can't come from the joint account. */
export const MEAL_VOUCHER_JOINT_MESSAGE = "Meal vouchers belong to a person: choose who paid";

/**
 * The payer must be complete, split shares must add up, only one kind of communication is allowed, and meal
 * vouchers need a person (or a split). Input only: existing rows are never re-validated.
 */
function checkPayment(value: PayerFields, ctx: z.RefinementCtx) {
  if (value.paymentMethod === "meal_voucher" && value.payerType === "joint") {
    ctx.addIssue({ code: "custom", path: ["payerType"], message: MEAL_VOUCHER_JOINT_MESSAGE });
  }
  if (value.payerType === "person" && !value.payerHabitantId) {
    ctx.addIssue({ code: "custom", path: ["payerHabitantId"], message: "Choose who pays" });
  }
  if (value.payerType === "split") {
    if (value.shares.length < 2) {
      ctx.addIssue({ code: "custom", path: ["shares"], message: "Split between at least two people" });
    }
    if (new Set(value.shares.map((share) => share.habitantId)).size !== value.shares.length) {
      ctx.addIssue({ code: "custom", path: ["shares"], message: "Each habitant can only have one share" });
    }
    if (value.shares.reduce((sum, share) => sum + share.amountCents, 0) !== value.amountCents) {
      ctx.addIssue({ code: "custom", path: ["shares"], message: "Shares must add up to the total amount" });
    }
  }
  if (value.structuredCommunication && value.reference) {
    ctx.addIssue({ code: "custom", path: ["reference"], message: "Use a structured communication or a reference, not both" });
  }
}

/** Drops what doesn't belong to the chosen payer: a habitant only for "person", shares only for "split". */
function normalizePayer<T extends PayerFields>(value: T): T {
  return {
    ...value,
    payerHabitantId: value.payerType === "person" ? (value.payerHabitantId ?? null) : null,
    shares: value.payerType === "split" ? value.shares : [],
  };
}

/** Edit one expense (a one-off, or a single instance of a recurring expense). */
export const expenseInputSchema = z
  .object({ ...paymentFields, dueDate: isoDateSchema, shopId: idSchema.optional().nullable() })
  .superRefine(checkPayment)
  .transform(normalizePayer);
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/**
 * Create an expense. With an `rrule` it becomes a recurring expense that starts on `dueDate` (the recurring
 * fields apply; `paidOn` and `shopId` are ignored). Without, a one-off; with `paidOn` it is saved as
 * already paid (everyday spending: "Log an expense").
 */
export const expenseCreateInputSchema = z
  .object({
    ...paymentFields,
    ...recurringFields,
    dueDate: isoDateSchema,
    shopId: idSchema.optional().nullable(),
    rrule: rruleSchema.optional().nullable(),
    paidOn: isoDateSchema.optional().nullable(),
  })
  .superRefine(checkPayment)
  .superRefine(checkTotalOpen)
  .transform(normalizePayer);
export type ExpenseCreateInput = z.infer<typeof expenseCreateInputSchema>;

/**
 * Edit a recurring expense: the template and RRULE. `startDate` is the new DTSTART; unpaid instances from
 * min(today, startDate) on are regenerated, paid and older ones stay as they are.
 */
export const recurringExpenseInputSchema = z
  .object({ ...paymentFields, ...recurringFields, startDate: isoDateSchema, rrule: rruleSchema })
  .superRefine(checkPayment)
  .superRefine(checkTotalOpen)
  .transform(normalizePayer);
export type RecurringExpenseInput = z.infer<typeof recurringExpenseInputSchema>;

/** Pause, resume or end a recurring expense. Ending defaults to today. */
export const recurringStatusInputSchema = z.object({
  status: recurringStatusSchema,
  endDate: isoDateSchema.optional().nullable(),
});
export type RecurringStatusInput = z.infer<typeof recurringStatusInputSchema>;

export const expensePaymentInputSchema = z.object({
  paidOn: isoDateSchema,
  /** Who marked it paid (optional). */
  paidById: idSchema.optional().nullable(),
});
export type ExpensePaymentInput = z.infer<typeof expensePaymentInputSchema>;

// ── Read models ─────────────────────────────────────────────────────────────────────────────────────

/** Payment details shared by expenses and recurring expenses. */
type PaymentDetails = {
  payee: string;
  description: string | null;
  amountCents: number;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod | null;
  beneficiaryName: string | null;
  /** Compact IBAN; format with `formatIban`. */
  iban: string | null;
  bic: string | null;
  /** 12 digits; format with `formatStructuredCommunication`. */
  structuredCommunication: string | null;
  reference: string | null;
  payerType: PayerType;
  /** Set for payer "person". */
  payerHabitantId: string | null;
  /** Set for payer "split". */
  shares: ExpenseShare[];
  notes: string | null;
  /** The project it counts towards (projects feature), or `null`. */
  project: ProjectRef | null;
};

export type Expense = PaymentDetails & {
  id: string;
  /** Set when the expense is an instance of a recurring expense. */
  recurringExpenseId: string | null;
  /** RRULE of the recurring expense, for display. */
  rrule: string | null;
  /** Kind of the recurring expense; `null` for a one-off. */
  kind: ExpenseKind | null;
  /** `YYYY-MM-DD` */
  dueDate: string;
  status: ExpenseStatus;
  shopId: string | null;
  /** `YYYY-MM-DD` */
  paidOn: string | null;
  paidById: string | null;
  /** Marked paid by the direct-debit job (and still paid). */
  autoPaid: boolean;
};

export type RecurringExpense = PaymentDetails & {
  id: string;
  kind: ExpenseKind;
  status: RecurringStatus;
  rrule: string;
  /** DTSTART, `YYYY-MM-DD` */
  startDate: string;
  /** Ended on, `YYYY-MM-DD`. */
  endDate: string | null;
  websiteUrl: string | null;
  trialEndsOn: string | null;
  /** The trial end date is today or later. */
  inTrial: boolean;
  remindDaysBefore: number | null;
  /** When to be reminded of the next due date; `null` without a reminder or when not active. */
  reminderOn: string | null;
  candidateToCancel: boolean;
  /** Next due date from today; `null` when paused, ended or past its last occurrence. */
  nextDueDate: string | null;
  /** Normalised cost, rounded to cents. */
  monthlyCents: number;
  yearlyCents: number;
  /** Loans and down payments with a total open amount: what is paid and left; `null` without one. */
  totalOpen: TotalOpenProgress | null;
};

/**
 * A loan or down payment (or anything else with a total open amount) for the money flow page: what it costs
 * per month and, with a total open amount, its progress. Ended ones are left out.
 */
export type LoanSummary = Pick<RecurringExpense, "id" | "payee" | "kind" | "status" | "amountCents" | "rrule" | "monthlyCents" | "nextDueDate" | "totalOpen">;

/**
 * An expense as money leaving the household in a month (the money flow timeline): paid ones on their payment
 * date, unpaid ones on their due date, and computed occurrences of running recurring expenses beyond the
 * generation horizon (`virtual`, loans stopping after their partial last payment). Meal vouchers left out.
 */
export type ExpenseFlowItem = {
  /** `YYYY-MM-DD`: paid on, else due on. */
  date: string;
  amountCents: number;
  paid: boolean;
  /** An instance (or computed occurrence) of a recurring expense. */
  recurring: boolean;
  /** Kind of its recurring expense; `null` for one-offs. */
  kind: ExpenseKind | null;
  virtual: boolean;
};

/** A payee used before, offered for quick reselection with its last category and payment details. */
export type PayeeSuggestion = {
  name: string;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod | null;
  beneficiaryName: string | null;
  iban: string | null;
  bic: string | null;
  /** Due date of the most recent expense, `YYYY-MM-DD`. */
  lastUsedOn: string;
};

export type ExpensePeriodTotal = {
  /** Everything due in the period, paid or not. */
  totalCents: number;
  unpaidCents: number;
  count: number;
};

export type ExpenseTotals = {
  thisMonth: ExpensePeriodTotal;
  nextMonth: ExpensePeriodTotal;
  overdue: { totalCents: number; count: number };
};

export type RecurringTotals = {
  /** Active recurring expenses only. */
  monthlyCents: number;
  yearlyCents: number;
  activeCount: number;
  /** Yearly cost of active ones flagged "candidate to cancel": what cancelling them would save. */
  candidatesYearlyCents: number;
  candidatesCount: number;
};

/** `GET /api/expenses` */
export type ExpensesOverview = {
  /** Today in the household time zone, `YYYY-MM-DD`: the reference for every status. */
  today: string;
  /** Unpaid expenses (including generated instances ahead) and expenses paid in the last year. */
  expenses: Expense[];
  recurring: RecurringExpense[];
  payees: PayeeSuggestion[];
  totals: ExpenseTotals;
  recurringTotals: RecurringTotals;
};

/** `GET /api/expenses/:id` */
export type ExpenseDetail = {
  today: string;
  expense: Expense;
  recurring: RecurringExpense | null;
  /** Other expenses of the same recurring expense, or of the same payee for one-offs. Newest first. */
  history: Expense[];
};

/** `GET /api/expenses/recurring/:id` */
export type RecurringExpenseDetail = {
  today: string;
  recurring: RecurringExpense;
  /** Unpaid instances, soonest first (a few). */
  upcoming: Expense[];
  /** Paid and past instances, newest first. */
  history: Expense[];
};

/** `GET /api/expenses/summary`: what the dashboard shows. */
export type ExpensesSummary = {
  today: string;
  /** Unpaid expenses due up to two weeks ahead, overdue ones included, soonest first. */
  upcoming: Expense[];
  dueThisWeek: { count: number; totalCents: number };
  overdue: { count: number; totalCents: number };
  recurring: RecurringTotals;
};

/** Admins (owner, adult) manage expenses; children can only look. Mirrors the API's role check. */
export const canManageExpenses = (role: "owner" | "adult" | "child") => role !== "child";
