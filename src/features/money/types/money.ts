import { z } from "zod";
import type { LoanSummary } from "@/features/expenses";
import type { VoucherBalance } from "@/features/income";
import { hexColorSchema, idSchema, isoDateSchema } from "@/types/common";

/*
 * Money flow (Finance, phase 2): the joint current account and the joint savings account with their ledger
 * (contributions, transfers, corrections), contribution plans, and the month overview. Like the bank, but
 * not 1:1: the balance is the latest correction plus what happened after it. Paid joint expenses and
 * incomes landing on an account are computed into the balance, not copied into the ledger. See
 * docs/FINANCE.md.
 */

// ── Enumerations ────────────────────────────────────────────────────────────────────────────────────

export const ACCOUNT_KINDS = ["joint", "savings"] as const;
export const accountKindSchema = z.enum(ACCOUNT_KINDS);
export type AccountKind = z.infer<typeof accountKindSchema>;

/** Stored entry types plus the computed ones ("expense": a paid joint expense; "income" also from incomes). */
export const LEDGER_TYPES = ["contribution", "transfer", "income", "expense", "correction", "other"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/** Where a ledger line comes from: a stored entry, a paid joint expense or a recorded income. */
export type LedgerSource = "entry" | "expense" | "income";

export const ACCOUNT_COLORS = ["#124734", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#ca8a04", "#475569"] as const;

/** Largest amount accepted: € 10 000 000. */
export const MAX_MONEY_CENTS = 1_000_000_000;

/** How far ahead "Next to pay" looks. */
export const NEXT_TO_PAY_DAYS = 62;

// ── Field schemas ───────────────────────────────────────────────────────────────────────────────────

const positiveCents = z.coerce.number().int().min(1).max(MAX_MONEY_CENTS);
const balanceCents = z.coerce.number().int().min(0).max(MAX_MONEY_CENTS);

const textSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

/** A switch posts "on"; JSON may send a boolean. */
const switchSchema = z.preprocess((value) => value === true || value === "on" || value === "true", z.boolean());

/** Owners: an array (JSON) or a comma-separated list (form). */
const ownerIdsSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.split(",").map((id) => id.trim()).filter(Boolean) : (value ?? [])),
  z.array(idSchema).max(20),
);

/** Compact upper-case IBAN; validated loosely here (country + check digits + up to 30 characters). */
export const accountIbanSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, "").toUpperCase())
  .refine((value) => value === "" || /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(value), "Invalid IBAN")
  .transform((value) => value || null)
  .optional()
  .nullable();

// ── Input schemas ───────────────────────────────────────────────────────────────────────────────────

/** A new joint account; the opening balance becomes its first CORRECTION on `openingDate`. */
export const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: accountKindSchema,
  iban: accountIbanSchema,
  color: hexColorSchema.optional().nullable(),
  ownerIds: ownerIdsSchema,
  openingBalanceCents: balanceCents,
  /** The opening balance is negative (overdrawn). */
  negative: switchSchema.optional(),
  openingDate: isoDateSchema,
});
export type AccountCreateInput = z.infer<typeof accountCreateSchema>;

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  iban: accountIbanSchema,
  color: hexColorSchema.optional().nullable(),
  ownerIds: ownerIdsSchema,
  /** Joint expenses without an account are paid from the default joint account. */
  isDefault: switchSchema,
  archived: switchSchema,
});
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

/** "Set real balance": records a CORRECTION; nothing else changes. */
export const setBalanceSchema = z.object({
  date: isoDateSchema,
  balanceCents,
  negative: switchSchema.optional(),
  note: textSchema(300),
});
export type SetBalanceInput = z.infer<typeof setBalanceSchema>;

/** `habitant:<id>` (a person's contribution) or `account:<id>` (a transfer between joint accounts). */
export const transferFromSchema = z.string().regex(/^(habitant|account):[^\s:]{1,64}$/, "Choose where the money comes from");

/** "Record transfer": who (or which account) moved how much into a joint account. */
export const recordTransferSchema = z
  .object({
    from: transferFromSchema,
    toAccountId: idSchema,
    date: isoDateSchema,
    amountCents: positiveCents,
    note: textSchema(300),
  })
  .superRefine((value, ctx) => {
    if (value.from === `account:${value.toAccountId}`) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose another account" });
    }
  });
export type RecordTransferInput = z.infer<typeof recordTransferSchema>;

/** Any other money in or out of an account (interest, a withdrawal…). */
export const otherEntrySchema = z.object({
  direction: z.enum(["in", "out"]),
  date: isoDateSchema,
  amountCents: positiveCents,
  note: textSchema(300),
});
export type OtherEntryInput = z.infer<typeof otherEntrySchema>;

/**
 * A fixed monthly contribution of a person to a joint account. Saving a new amount for an existing plan
 * ends it the day before `activeFrom` and starts a new one, so earlier months keep their planned amount.
 */
export const contributionPlanSchema = z
  .object({
    habitantId: idSchema,
    accountId: idSchema,
    amountCents: positiveCents,
    dayOfMonth: z.coerce.number().int().min(1).max(31).default(1),
    activeFrom: isoDateSchema,
    activeTo: isoDateSchema.optional().nullable().transform((value) => value || null),
    note: textSchema(300),
  })
  .superRefine((value, ctx) => {
    if (value.activeTo && value.activeTo < value.activeFrom) {
      ctx.addIssue({ code: "custom", path: ["activeTo"], message: "Ends before it starts" });
    }
  });
export type ContributionPlanInput = z.infer<typeof contributionPlanSchema>;

/** `YYYY-MM` */
export const moneyMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/**
 * "Take back": a person takes (part of) an over-contribution back out of the joint account. Stored as a
 * negative CONTRIBUTION of that person, so it lowers the balance like a withdrawal and their net
 * transferred amount for the month.
 */
export const takeBackSchema = z.object({
  habitantId: idSchema,
  accountId: idSchema,
  date: isoDateSchema,
  amountCents: positiveCents,
  note: textSchema(300),
});
export type TakeBackInput = z.infer<typeof takeBackSchema>;

/** "Keep as extra": up to `amountCents` of a person's surplus in `month` is intentional (0 = flag it again). */
export const keepExtraSchema = z.object({
  habitantId: idSchema,
  accountId: idSchema,
  month: moneyMonthSchema,
  amountCents: z.coerce.number().int().min(0).max(MAX_MONEY_CENTS),
});
export type KeepExtraInput = z.infer<typeof keepExtraSchema>;

/**
 * The netting alternative: `fromHabitantId` paid `toHabitantId` directly instead of both going through the
 * joint account. Recorded as a pair of CONTRIBUTION entries (+ for who paid, − for who received) with one
 * transfer id: the balance doesn't change, each person's net transferred amount does.
 */
export const directPaymentSchema = z
  .object({
    fromHabitantId: idSchema,
    toHabitantId: idSchema,
    accountId: idSchema,
    date: isoDateSchema,
    amountCents: positiveCents,
  })
  .superRefine((value, ctx) => {
    if (value.fromHabitantId === value.toHabitantId) ctx.addIssue({ code: "custom", path: ["toHabitantId"], message: "Choose another person" });
  });
export type DirectPaymentInput = z.infer<typeof directPaymentSchema>;

/** "Update plans": new monthly amounts from the first day of `month` (earlier months keep theirs). */
export const planAmountsSchema = z.object({
  month: moneyMonthSchema,
  amounts: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    },
    z.array(z.object({ planId: idSchema, amountCents: positiveCents })).min(1).max(20),
  ),
});
export type PlanAmountsInput = z.infer<typeof planAmountsSchema>;

// ── Read models ─────────────────────────────────────────────────────────────────────────────────────

export type JointAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  iban: string | null;
  color: string;
  ownerIds: string[];
  isDefault: boolean;
  archived: boolean;
  /** Today's balance. */
  balanceCents: number;
  /** The latest correction up to today (the opening balance at first). */
  lastCorrection: { date: string; balanceCents: number } | null;
};

/** One line of an account's history, with the balance after it. */
export type LedgerLine = {
  /** Unique in the ledger: `entry:<id>`, `expense:<id>` or `income:<id>`. */
  key: string;
  source: LedgerSource;
  /** The stored entry (deletable), the expense or the income it comes from. */
  sourceId: string;
  accountId: string;
  date: string;
  type: LedgerType;
  /** Signed; for a correction the difference with the balance just before it. */
  amountCents: number;
  /** Correction only: the balance it set. */
  setBalanceCents: number | null;
  habitantId: string | null;
  /** Transfer: the other account. */
  counterpartAccountId: string | null;
  /** Contribution settled directly between two people (see `directPaymentSchema`): the other person. */
  counterpartHabitantId?: string | null;
  /** Payee of an expense, name of an income. */
  label: string | null;
  note: string | null;
  balanceAfterCents: number;
  /** Dated after today: not in today's balance yet. */
  future: boolean;
};

export type AccountMonth = {
  accountId: string;
  /** Balance at the end of the previous month. */
  openingCents: number;
  /** Balance at the end of the month (today for the current month, later dates included when recorded). */
  closingCents: number;
  /** Money in and out this month up to today; corrections are not counted. */
  inCents: number;
  outCents: number;
  /** Lines of this month dated after today (a future-dated income…): they count from their date on. */
  plannedInCents: number;
  plannedOutCents: number;
  correctionsCents: number;
  /** This month's lines, newest first. */
  lines: LedgerLine[];
};

export type ContributionPlan = {
  id: string;
  habitantId: string;
  accountId: string;
  amountCents: number;
  dayOfMonth: number;
  activeFrom: string;
  activeTo: string | null;
  note: string | null;
};

/** One contribution of a person in a month (negative: taken back, or received in a direct payment). */
export type ContributionEntry = {
  /** The ledger entry (deletable). */
  id: string;
  date: string;
  amountCents: number;
  note: string | null;
  /**
   * A later correction (real balance) already included it: it counts for the month's plan, but it didn't
   * change the balance.
   */
  absorbed: boolean;
  /** Part of a direct payment between two people: the other person. */
  counterpartHabitantId: string | null;
};

/** Planned vs recorded contributions of one person to one account in a month. */
export type ContributionRow = {
  habitantId: string;
  accountId: string;
  planId: string | null;
  plannedCents: number;
  /** The planned day in this month. */
  plannedDate: string | null;
  /** Net: contributions minus what was taken back. */
  recordedCents: number;
  /** What is still to transfer (never negative). */
  remainingCents: number;
  /** The month's entries of this person on this account, oldest first. */
  entries: ContributionEntry[];
  /** Surplus kept as extra on purpose ("Keep as extra"). */
  keptExtraCents: number;
};

/** What the joint current accounts pay in a month (payer JOINT, meal vouchers left out), for the coverage check. */
export type JointCosts = {
  /** Paid in the month. */
  paidCents: number;
  /** Unpaid and due in the month, computed occurrences of recurring expenses and loans included. */
  toPayCents: number;
  /** The unpaid ones by due date, oldest first. */
  toPay: { date: string; amountCents: number }[];
};

/** Income of one person (or "joint") in the month: received vs expected, meal vouchers left out. */
export type MoneyIncomeRow = {
  key: string;
  receivedCents: number;
  expectedCents: number;
  totalCents: number;
  /** Variable incomes whose amount still has to be entered. */
  toEnterCount: number;
};

export type JointOutgoing = {
  id: string;
  payee: string;
  amountCents: number;
  dueDate: string;
  paidOn: string | null;
  category: string;
};

/** Meal vouchers per person: the income feature's FIFO balance with expiry (docs/FINANCE.md). */
export type MoneyVoucherBalance = VoucherBalance;

/** `GET /api/money?month=YYYY-MM` */
export type MoneyMonth = {
  today: string;
  month: string;
  accounts: JointAccount[];
  accountMonths: AccountMonth[];
  income: { people: MoneyIncomeRow[]; household: Omit<MoneyIncomeRow, "key">; vouchersCents: Record<string, number> };
  plans: ContributionPlan[];
  contributions: ContributionRow[];
  /** Joint expenses due or paid this month. */
  jointOutgoings: { items: JointOutgoing[]; paidCents: number; upcomingCents: number };
  /** Joint costs of the month for the coverage check (computed occurrences included). */
  jointCosts: JointCosts;
  vouchers: MoneyVoucherBalance[];
};

/** `GET /api/money/summary`: the dashboard's money card. */
export type MoneySummary = {
  today: string;
  month: string;
  /** Household income this month: received plus still expected (meal vouchers left out). */
  incomeCents: number;
  incomeReceivedCents: number;
  /** Expenses due this month, all payers. */
  outCents: number;
  outPaidCents: number;
  /** The default joint account's balance today; `null` without one. */
  jointBalanceCents: number | null;
  savingsBalanceCents: number | null;
};

/** `GET /api/money/loans`: loans and down payments (expenses feature) with what is still open. */
export type MoneyLoans = {
  today: string;
  /** Running loans and down payments (and anything else with a total open amount), most open first. */
  loans: LoanSummary[];
  totals: {
    /** Still open, over the loans with a total open amount. */
    remainingCents: number;
    /** Their total open amounts. */
    totalCents: number;
    /** Paid since their as-of dates. */
    repaidCents: number;
    /** Monthly cost of the active loans and down payments now (with or without a total open amount). */
    monthlyCents: number;
    /** Loans with a total open amount. */
    trackedCount: number;
  };
};

/** One month of the income and expenses timeline. */
export type TimelineMonth = {
  /** `YYYY-MM` */
  month: string;
  /** Past: what came in and was paid; current: that plus what is still expected; future: projected. */
  period: "past" | "current" | "future";
  incomeCents: number;
  /** Part of the income that is a variable source's estimate. */
  incomeEstimateCents: number;
  expenseCents: number;
  /** Expenses split: loans and down payments, other recurring, one-off. */
  loansCents: number;
  recurringCents: number;
  oneOffCents: number;
  /** Income − expenses. */
  netCents: number;
};

/** `GET /api/money/timeline?from=YYYY-MM&to=YYYY-MM` */
export type MoneyTimeline = {
  today: string;
  /** `YYYY-MM` */
  from: string;
  to: string;
  months: TimelineMonth[];
};

/** Longest timeline the API returns, in months. */
export const MAX_TIMELINE_MONTHS = 60;
/** Default timeline: this many months back and ahead of the current month. */
export const TIMELINE_MONTHS_BACK = 12;
export const TIMELINE_MONTHS_AHEAD = 24;

/** Admins (owner, adult) manage the joint accounts; children can only look. Mirrors the API's role check. */
export const canManageMoney = (role: "owner" | "adult" | "child") => role !== "child";
