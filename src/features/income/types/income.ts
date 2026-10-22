import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";
import { isValidRRule, type MonthEndPolicy, type RRuleSupport } from "@/types/recurrence";

/*
 * Income (Finance, phase 2): recurring household incomes per member (or joint) and incomes actually
 * received. A recurring income is a source whose occurrences are computed from its RRULE; a FIXED source
 * takes its amount from an amount history, a VARIABLE one (meal vouchers…) asks for the actual amount every
 * period. See docs/FINANCE.md.
 */

// ── Enumerations ────────────────────────────────────────────────────────────────────────────────────

export const INCOME_KINDS = [
  "salary",
  "holiday_pay",
  "bonus",
  "meal_vouchers",
  "benefit",
  "tax_return",
  "green_certificates",
  "gift",
  "sale",
  "other",
] as const;
export const incomeKindSchema = z.enum(INCOME_KINDS);
export type IncomeKind = z.infer<typeof incomeKindSchema>;

/** Kinds a recurring income can have. */
export const SOURCE_KINDS = ["salary", "holiday_pay", "bonus", "meal_vouchers", "benefit", "other"] as const satisfies readonly IncomeKind[];
export const sourceKindSchema = z.enum(SOURCE_KINDS);

/** Kinds offered first for a one-off income. */
export const ONE_OFF_KINDS = [
  "tax_return",
  "green_certificates",
  "gift",
  "sale",
  "bonus",
  "holiday_pay",
  "meal_vouchers",
  "benefit",
  "salary",
  "other",
] as const satisfies readonly IncomeKind[];

/** Meal vouchers are not money in the bank: they feed the voucher balance, not the money totals. */
export const VOUCHER_KIND: IncomeKind = "meal_vouchers";

export const AMOUNT_MODES = ["fixed", "variable"] as const;
export const amountModeSchema = z.enum(AMOUNT_MODES);
export type AmountMode = z.infer<typeof amountModeSchema>;

/** "Who": a habitant id, or this value for a joint income. */
export const JOINT = "joint";

/** Largest amount accepted: € 1 000 000. */
export const MAX_INCOME_CENTS = 100_000_000;

/** Weekly, monthly or yearly, with COUNT or UNTIL; no weekdays, no seasons. */
export const INCOME_RRULE_SUPPORT = { frequencies: ["WEEKLY", "MONTHLY", "YEARLY"], byDay: false, seasons: false } as const satisfies RRuleSupport;

/** A salary on the 31st falls on the last day of shorter months. */
export const INCOME_MONTH_END: MonthEndPolicy = "clamp";

// ── Field schemas ───────────────────────────────────────────────────────────────────────────────────

const centsSchema = z.coerce.number().int().min(1).max(MAX_INCOME_CENTS);

/** "joint" or empty means joint (null); otherwise a habitant id. */
const ownerSchema = z
  .union([z.literal(JOINT), idSchema])
  .optional()
  .nullable()
  .transform((value) => (!value || value === JOINT ? null : value));

/** The "no account" choice of a select (selects can't hold an empty value). */
export const NO_ACCOUNT = "none";

/** Empty (or "none") means "no account". */
const optionalIdSchema = idSchema
  .optional()
  .nullable()
  .transform((value) => (!value || value === NO_ACCOUNT ? null : value));

const textSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const incomeRRuleSchema = z
  .string()
  .trim()
  .max(200)
  .refine((rule) => isValidRRule(rule, INCOME_RRULE_SUPPORT), "Unsupported recurrence rule");

// ── Input schemas ───────────────────────────────────────────────────────────────────────────────────

const sourceFields = {
  habitantId: ownerSchema,
  name: z.string().trim().min(1).max(80),
  kind: sourceKindSchema,
  rrule: incomeRRuleSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional().nullable().transform((value) => value || null),
  amountMode: amountModeSchema.default("fixed"),
  /** FIXED: the amount (on create: from the start date; on edit: from `amountFrom`). */
  amountCents: centsSchema.optional().nullable(),
  /** VARIABLE: what to expect when nothing has been entered (optional). */
  estimateCents: centsSchema.optional().nullable(),
  targetAccountId: optionalIdSchema,
  notes: textSchema(2000),
};

type SourceCheck = { amountMode: AmountMode; amountCents?: number | null; startDate: string; endDate: string | null };

function checkSource(value: SourceCheck, ctx: z.RefinementCtx, amountRequired: boolean) {
  if (value.amountMode === "fixed" && amountRequired && !value.amountCents) {
    ctx.addIssue({ code: "custom", path: ["amountCents"], message: "Enter the amount" });
  }
  if (value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "Ends before it starts" });
  }
}

/** Add a recurring income. A fixed one needs its amount (effective from the start date). */
export const incomeSourceCreateSchema = z.object(sourceFields).superRefine((value, ctx) => checkSource(value, ctx, true));
export type IncomeSourceCreateInput = z.infer<typeof incomeSourceCreateSchema>;

/**
 * Edit a recurring income. A different `amountCents` for a fixed one adds it to the amount history from
 * `amountFrom` (default today), so earlier months keep their amount.
 */
export const incomeSourceUpdateSchema = z
  .object({ ...sourceFields, amountFrom: isoDateSchema.optional().nullable().transform((value) => value || null) })
  .superRefine((value, ctx) => checkSource(value, ctx, false));
export type IncomeSourceUpdateInput = z.infer<typeof incomeSourceUpdateSchema>;

/** One entry of a fixed source's amount history. */
export const incomeAmountInputSchema = z.object({ effectiveFrom: isoDateSchema, amountCents: centsSchema });
export type IncomeAmountInput = z.infer<typeof incomeAmountInputSchema>;

/**
 * Record income that came in: a one-off (tax return, green certificates…), or the actual amount of one
 * occurrence of a recurring income (`sourceId` + `periodDate`; who, kind and account then come from the
 * source when left out).
 */
export const incomeInputSchema = z
  .object({
    habitantId: ownerSchema,
    date: isoDateSchema,
    amountCents: centsSchema,
    kind: incomeKindSchema.default("other"),
    description: textSchema(120),
    sourceId: optionalIdSchema,
    periodDate: isoDateSchema.optional().nullable().transform((value) => value || null),
    targetAccountId: optionalIdSchema,
    note: textSchema(2000),
  })
  .superRefine((value, ctx) => {
    if (value.periodDate && !value.sourceId) {
      ctx.addIssue({ code: "custom", path: ["periodDate"], message: "A period belongs to a recurring income" });
    }
  });
export type IncomeInput = z.infer<typeof incomeInputSchema>;

// ── Read models ─────────────────────────────────────────────────────────────────────────────────────

export type IncomeAmountEntry = { id: string; effectiveFrom: string; amountCents: number };

export type IncomeSource = {
  id: string;
  /** `null`: joint. */
  habitantId: string | null;
  name: string;
  kind: IncomeKind;
  rrule: string;
  startDate: string;
  endDate: string | null;
  amountMode: AmountMode;
  estimateCents: number | null;
  targetAccountId: string | null;
  notes: string | null;
  /** FIXED: the amount history, oldest first. */
  amounts: IncomeAmountEntry[];
  /** FIXED: the amount today (or the first one when it only starts later); VARIABLE: the estimate. */
  currentAmountCents: number | null;
  /** From when the current amount applies. */
  currentAmountFrom: string | null;
  /** Next occurrence from today; `null` when ended. */
  nextDate: string | null;
  /** Not ended (no end date, or one today or later). */
  active: boolean;
  /** Normalised to a month (exact amount × occurrences per year / 12), rounded to cents. */
  monthlyCents: number | null;
};

export type Income = {
  id: string;
  habitantId: string | null;
  date: string;
  amountCents: number;
  kind: IncomeKind;
  description: string | null;
  sourceId: string | null;
  periodDate: string | null;
  targetAccountId: string | null;
  note: string | null;
};

/**
 * Derived per occurrence, relative to today: received (recorded, dated today or earlier), upcoming (recorded
 * with a later date: still expected), expected (fixed, nothing recorded) or still to enter (variable).
 */
export const OCCURRENCE_STATUSES = ["received", "upcoming", "expected", "to_enter"] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

/** One planned occurrence of a recurring income in a period, with what was recorded for it. */
export type IncomeOccurrence = {
  sourceId: string;
  name: string;
  kind: IncomeKind;
  habitantId: string | null;
  amountMode: AmountMode;
  /** The planned date (the period). */
  date: string;
  /** FIXED: the amount on that date; VARIABLE: the estimate (may be `null`). */
  plannedCents: number | null;
  targetAccountId: string | null;
  /** What was recorded for this occurrence. */
  income: Income | null;
  status: OccurrenceStatus;
};

/** Totals of one person (or joint) in a month. Meal vouchers are left out (see `vouchers`). */
export type IncomeTotal = {
  /** A habitant id, or "joint". */
  key: string;
  /** Recorded incomes dated today or earlier. */
  receivedCents: number;
  /** Recorded incomes dated after today, and occurrences without a recorded income (fixed amounts, variable estimates). */
  expectedCents: number;
  /** Planned occurrences (actual when recorded, else planned) plus one-offs: received + expected. */
  totalCents: number;
};

export type IncomeMonthTotals = {
  people: IncomeTotal[];
  household: Omit<IncomeTotal, "key">;
  /** Meal vouchers received this month (dated today or earlier), per habitant id. */
  vouchersCents: Record<string, number>;
};

/**
 * Belgian electronic meal vouchers expire 12 months after they are credited: each received meal voucher income
 * is a lot, usable up to and including the same date 12 months later (`voucherExpiry`).
 */
export const VOUCHER_VALID_MONTHS = 12;
/** Warn (and make a "use them" task) when vouchers expire within this many days. */
export const VOUCHER_WARN_DAYS = 30;

/** What is left of meal vouchers that expire on one day. */
export type VoucherExpiry = { date: string; amountCents: number };

/**
 * Meal voucher balance of one habitant, everything up to today. Spending uses the oldest vouchers that are
 * still valid first (FIFO); what was not spent before its expiry date is expired.
 */
export type VoucherBalance = {
  habitantId: string;
  /** Every voucher received up to today. */
  receivedCents: number;
  /** Everything paid with vouchers up to today. */
  spentCents: number;
  /** Still valid and not spent. */
  availableCents: number;
  /** Expired before it was spent. */
  expiredCents: number;
  /** Paid with vouchers while none were valid (missing or late voucher incomes). */
  uncoveredCents: number;
  /** `availableCents − uncoveredCents`: negative when more was spent than there was. */
  balanceCents: number;
  /** The next expiry date of what is available, with the amount left on it. */
  nextExpiry: VoucherExpiry | null;
  /** The first expiry within `VOUCHER_WARN_DAYS` of today, if any. */
  expiringSoon: VoucherExpiry | null;
};

/** The joint accounts an income can land on (managed on the money flow page). */
export type IncomeTargetAccount = { id: string; name: string; kind: "joint" | "savings" };

/** `GET /api/income?month=YYYY-MM` */
export type IncomeOverview = {
  today: string;
  /** `YYYY-MM` */
  month: string;
  sources: IncomeSource[];
  /** Occurrences of the month, by date. */
  occurrences: IncomeOccurrence[];
  /** Recorded incomes of the month dated after today that no occurrence shows (one-offs announced ahead). */
  upcoming: Income[];
  /** Recorded incomes, newest first (the last two years and anything ahead). */
  incomes: Income[];
  totals: IncomeMonthTotals;
  vouchers: VoucherBalance[];
  accounts: IncomeTargetAccount[];
};

/** Admins (owner, adult) manage incomes; children can only look. Mirrors the API's role check. */
export const canManageIncome = (role: "owner" | "adult" | "child") => role !== "child";

/** `YYYY-MM` */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
