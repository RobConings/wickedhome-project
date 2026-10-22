import { z } from "zod";
import { amountFor, computeRecurringTotals, matchesPayer, type PayerFilter } from "@/features/expenses/types/expense-calculations";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_KINDS,
  RECURRING_STATUSES,
  expenseCreateInputSchema,
  type Expense,
  type RecurringExpense,
} from "@/features/expenses/types/expenses";
import { monthBounds } from "@/features/money/types/money-calculations";
import { addDays, monthOf, todayIn } from "@/types/dates";
import { listLinkedFiles } from "@/api/documents/documents.service";
import {
  EXPENSE_DOCUMENT_TYPE,
  createExpense,
  getExpenseDetail,
  getExpensesOverview,
  getRecurringExpenseDetail,
  listExpensesBetween,
  listRecurringExpenses,
  listUnpaidExpenses,
} from "@/api/expenses/expenses.service";
import { db } from "@/api/lib/db";
import { badRequest } from "@/api/lib/http";
import { getLinkedHolds } from "@/api/tasks/tasks.service";
import {
  capList,
  day,
  done,
  entityNames,
  entityRef,
  eurosSchema,
  money,
  monthSchema,
  optionalDateSchema,
  registerAssistantContext,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  registerScreenContext,
  say,
  toCents,
  type AssistantToolContext,
} from "@ai/core/kit";
import { MONEY_ROLES, expenseCandidates, methodText, payerText, paymentInfo, rhythm } from "./shared";
import "./changes";

/**
 * Skill "expenses": bills, recurring payments and everyday spending (guide: guide.md next to this file).
 * Reading follows the expenses page (everyone, children included); changes are for owners and adults
 * (changes.ts). Every rule lives in the expenses service and contract; these tools translate.
 */

registerAssistantSkill({
  id: "expenses",
  title: { en: "Expenses and bills", nl: "Uitgaven en rekeningen" },
  summary: "Bills and recurring payments (energy, loans, insurance, subscriptions): due, history, payment details (IBAN, OGM), add, edit, mark paid, log spending.",
  keywords: {
    nl: ["betalen", "betaald", "betaling", "factuur", "facturen", "rekening", "uitgave", "uitgegeven", "kost", "kosten", "abonnement", "domiciliering", "domiciliëring", "overschrijving", "lening", "afbetaling", "verzekering", "te betalen", "euro", "gestructureerde mededeling", "mededeling", "iban", "ogm"],
    en: ["pay", "paid", "payment", "bill", "invoice", "expense", "spent", "cost", "subscription", "direct debit", "wire transfer", "loan", "insurance", "due", "structured communication"],
  },
});

const LIST_LIMIT = 25;

registerEntityResolver({
  type: "recurring_expense",
  label: "recurring payment",
  skill: "expenses",
  list: async (ctx) =>
    (await listRecurringExpenses(ctx.householdId))
      .filter((expense) => expense.status !== "ended")
      .map((expense) => ({
        id: expense.id,
        name: expense.description ? `${expense.payee} – ${expense.description}` : expense.payee,
        aliases: [expense.payee, ...(expense.description ? [expense.description] : [])],
        hint: `${money(expense.amountCents)}${expense.status === "paused" ? ", paused" : ""}`,
      })),
});

/** How far back and ahead an expense can be named (ids from earlier results work too). */
const NAMED_DAYS = 92;

registerEntityResolver({
  type: "expense",
  label: "expense",
  skill: "expenses",
  search: async (ctx) => {
    const today = todayIn();
    const [unpaid, recent] = await Promise.all([
      listUnpaidExpenses(ctx.householdId, addDays(today, NAMED_DAYS)),
      listExpensesBetween(ctx.householdId, addDays(today, -NAMED_DAYS), today),
    ]);
    const byId = new Map([...unpaid, ...recent.filter((expense) => expense.paidOn)].map((expense) => [expense.id, expense]));
    return expenseCandidates([...byId.values()]);
  },
});

registerEntityResolver({
  type: "account",
  label: "payment account",
  skill: "expenses",
  list: async (ctx) => {
    const rows = await db.paymentAccount.findMany({ where: { householdId: ctx.householdId, archived: false }, select: { id: true, name: true, kind: true, isDefault: true } });
    const aliases = { JOINT: ["gezamenlijke rekening", "gemeenschappelijke rekening", "joint account", "zichtrekening"], SAVINGS: ["spaarrekening", "savings account", "spaarpot"], PERSONAL: [] };
    return rows.map((row) => ({ id: row.id, name: row.name, aliases: aliases[row.kind], hint: row.kind.toLowerCase() + (row.isDefault ? ", default" : "") }));
  },
});

registerAssistantContext({
  id: "accounts",
  order: 30,
  build: async (ctx) => {
    const rows = await db.paymentAccount.findMany({ where: { householdId: ctx.householdId, archived: false }, select: { name: true, kind: true, isDefault: true }, orderBy: { createdAt: "asc" } });
    return rows.length ? `Accounts: ${rows.map((row) => `${row.name} (${row.kind.toLowerCase()}${row.isDefault ? ", default" : ""})`).join(", ")}.` : null;
  },
});

/** One snapshot line: unpaid bills due in the coming week (the question asked most), at most three named. */
registerAssistantContext({
  id: "bills",
  order: 31,
  build: async (ctx) => {
    const today = todayIn();
    const unpaid = await listUnpaidExpenses(ctx.householdId, addDays(today, 7));
    if (!unpaid.length) return "Bills due within 7 days: none.";
    const overdue = unpaid.filter((expense) => expense.dueDate < today).length;
    const named = unpaid.slice(0, 3).map((expense) => `${expense.payee} ${money(expense.amountCents)} ${day(expense.dueDate)}${expense.paymentMethod === "direct_debit" ? " (direct debit)" : ""}`);
    const more = unpaid.length > 3 ? ` +${unpaid.length - 3} more` : "";
    return `Bills due within 7 days: ${named.join(", ")}${more}${overdue ? ` (${overdue} overdue)` : ""}.`;
  },
});

/** "Whose" filter of the due and history views. */
const payerFilterArgs = {
  joint: z.boolean().optional().describe("Only what the joint account pays"),
  person: entityRef("habitant", "Only what this person pays (own bills and their share of split ones)").optional(),
};
const payerFilterOf = (input: { joint?: boolean; person?: { id: string } }): PayerFilter =>
  input.person ? { habitantId: input.person.id } : input.joint ? "joint" : "all";

const holdsOf = (ctx: AssistantToolContext) => getLinkedHolds(ctx.user, "expense").catch(() => ({}) as Record<string, string | null>);

registerAssistantTool({
  name: "expenses.due",
  description:
    "Unpaid bills due in the coming days (overdue included), soonest first: payee, amount, due date, method, payer, on hold. For 'what do we have to pay this week' or 'what does Clara still have to pay'.",
  input: z.object({
    days: z.number().int().min(0).max(62).default(7).describe("How many days ahead, default 7"),
    ...payerFilterArgs,
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked what's due to pay", nl: "Te betalen bekeken" },
  run: async (ctx, input) => {
    const today = todayIn();
    const until = addDays(today, input.days);
    const filter = payerFilterOf(input);
    const [unpaid, names, holds] = await Promise.all([listUnpaidExpenses(ctx.householdId, until), entityNames(ctx, "habitant"), holdsOf(ctx)]);
    const list = unpaid.filter((expense) => matchesPayer(expense, filter));
    const own = (expense: Expense) => (input.person ? amountFor(expense, input.person.id) || expense.amountCents : expense.amountCents);
    return {
      until,
      total: money(list.reduce((sum, expense) => sum + own(expense), 0)),
      overdue: list.filter((expense) => expense.dueDate < today).length,
      ...capList(list, LIST_LIMIT, (expense) => ({
        id: expense.id,
        payee: expense.payee,
        what: expense.description,
        amount: money(expense.amountCents),
        theirShare: input.person && expense.payerType === "split" ? money(amountFor(expense, input.person.id)) : null,
        due: expense.dueDate,
        method: expense.paymentMethod === "direct_debit" ? "direct debit (automatic)" : expense.paymentMethod,
        payer: filter === "all" ? payerText(expense, names) : null,
        onHold: expense.id in holds ? (holds[expense.id] ?? "on hold") : null,
      })),
    };
  },
});

/** A recurring expense in a few fields; loans with their total still open and the partial last payment. */
function recurringSummary(recurring: RecurringExpense, names: Map<string, string>) {
  const open = recurring.totalOpen;
  return {
    name: recurring.description ? `${recurring.payee} – ${recurring.description}` : recurring.payee,
    kind: recurring.kind,
    status: recurring.status === "active" ? null : recurring.status,
    amount: money(recurring.amountCents),
    rhythm: rhythm(recurring.rrule),
    nextDue: recurring.nextDueDate,
    perMonth: money(recurring.monthlyCents),
    payer: payerText(recurring, names),
    method: methodText(recurring.paymentMethod),
    loan: open
      ? `${money(open.remainingCents)} of ${money(open.totalCents)} left, ${open.paymentsLeft} payments to go${open.lastDate ? `, last ${day(open.lastDate)} (${money(open.lastAmountCents)})` : ""}`
      : null,
    endDate: recurring.endDate,
    trialUntil: recurring.inTrial ? recurring.trialEndsOn : null,
    cancelCandidate: recurring.candidateToCancel || null,
  };
}

registerAssistantTool({
  name: "expenses.list",
  description:
    "Recurring expenses (subscriptions, loans with what is still open, insurance; totals per month/year) or the paid history of a month (totals per category). For 'which subscriptions do we have' or 'what did we spend on groceries in September'.",
  input: z.object({
    view: z.enum(["recurring", "history"]),
    kind: z.enum(EXPENSE_KINDS).optional().describe("recurring: only this kind"),
    status: z.enum(RECURRING_STATUSES).optional().describe("recurring: only this status (default active and paused)"),
    month: monthSchema("history: month YYYY-MM (default this month)").optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional().describe("history: only this category"),
    ...payerFilterArgs,
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at the expenses", nl: "Uitgaven bekeken" },
  run: async (ctx, input) => {
    const names = await entityNames(ctx, "habitant");
    const filter = payerFilterOf(input);
    if (input.view === "recurring") {
      const { recurring } = await getExpensesOverview(ctx.householdId);
      const list = recurring.filter(
        (item) => (input.status ? item.status === input.status : item.status !== "ended") && (!input.kind || item.kind === input.kind) && matchesPayer(item, filter),
      );
      const totals = computeRecurringTotals(list);
      return {
        perMonth: money(totals.monthlyCents),
        perYear: money(totals.yearlyCents),
        cancelCandidatesPerYear: totals.candidatesCount ? money(totals.candidatesYearlyCents) : null,
        ...capList(list, LIST_LIMIT, (item) => recurringSummary(item, names)),
      };
    }
    const month = input.month ?? monthOf(todayIn());
    const { from, to } = monthBounds(month);
    const paid = (await listExpensesBetween(ctx.householdId, from, to))
      .filter((expense) => expense.paidOn && expense.paidOn >= from && expense.paidOn <= to)
      .filter((expense) => (!input.category || expense.category === input.category) && matchesPayer(expense, filter))
      .sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? ""));
    const own = (expense: Expense) => (input.person ? amountFor(expense, input.person.id) || expense.amountCents : expense.amountCents);
    const byCategory = new Map<string, number>();
    for (const expense of paid) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + own(expense));
    return {
      month,
      total: money(paid.reduce((sum, expense) => sum + own(expense), 0)),
      count: paid.length,
      byCategory: [...byCategory].sort((a, b) => b[1] - a[1]).map(([category, cents]) => `${category} ${money(cents)}`).join(", "),
      ...capList(paid, LIST_LIMIT, (expense) => ({
        id: expense.id,
        payee: expense.payee,
        amount: money(expense.amountCents),
        paidOn: expense.paidOn,
        category: expense.category,
        payer: filter === "all" ? payerText(expense, names) : null,
        method: expense.paymentMethod,
      })),
    };
  },
});

registerAssistantTool({
  name: "expenses.details",
  description:
    "Everything about one bill or recurring expense: amount, due/paid, payer, payment details exactly as recorded (beneficiary, IBAN, OGM or reference), on hold, project, attached documents, loan progress, recent payments. Use before telling anyone how to pay; never make up an IBAN or OGM.",
  input: z.object({
    expense: entityRef("expense", "A bill by payee, e.g. 'Fluvius' (add a date for another payment), or id").optional(),
    recurring: entityRef("recurring_expense", "A recurring expense (subscription, loan…) by name").optional(),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked up an expense", nl: "Uitgave opgezocht" },
  run: async (ctx, input) => {
    const names = await entityNames(ctx, "habitant");
    if (input.expense) {
      const detail = await getExpenseDetail(ctx.householdId, input.expense.id);
      const expense = detail.expense;
      const [holds, files] = await Promise.all([
        holdsOf(ctx),
        listLinkedFiles(ctx.householdId, { entityType: EXPENSE_DOCUMENT_TYPE, entityId: expense.id }).catch(() => []),
      ]);
      return {
        id: expense.id,
        payee: expense.payee,
        what: expense.description,
        amount: money(expense.amountCents),
        due: expense.dueDate,
        status: expense.status,
        paidOn: expense.paidOn,
        autoPaid: expense.autoPaid || null,
        category: expense.category,
        payer: payerText(expense, names),
        ...paymentInfo(expense),
        onHold: expense.id in holds ? (holds[expense.id] ?? "on hold") : null,
        project: expense.project?.name,
        notes: expense.notes,
        documents: files.length ? files.slice(0, 5).map((file) => file.name).join(", ") : null,
        recurring: detail.recurring ? recurringSummary(detail.recurring, names) : null,
        earlier: detail.history.slice(0, 3).map((item) => `${money(item.amountCents)} due ${day(item.dueDate)}${item.paidOn ? `, paid ${day(item.paidOn)}` : ", unpaid"}`),
      };
    }
    if (!input.recurring) throw badRequest("Name a bill (expense) or a recurring expense (recurring)");
    const detail = await getRecurringExpenseDetail(ctx.householdId, input.recurring.id);
    return {
      id: detail.recurring.id,
      ...recurringSummary(detail.recurring, names),
      ...paymentInfo(detail.recurring),
      category: detail.recurring.category,
      project: detail.recurring.project?.name,
      website: detail.recurring.websiteUrl,
      notes: detail.recurring.notes,
      upcoming: detail.upcoming.slice(0, 3).map((item) => `${money(item.amountCents)} ${day(item.dueDate)}`),
      paid: detail.history.slice(0, 3).map((item) => `${money(item.amountCents)} ${day(item.paidOn ?? item.dueDate)}`),
    };
  },
});

/** Meal vouchers belong to a person (docs/FINANCE.md): paying with them always means "paid by me". */
const paidByMe = (input: { paidBy: "joint" | "me"; paymentMethod: string }) => input.paidBy === "me" || input.paymentMethod === "meal_voucher";

registerAssistantTool({
  name: "expenses.log",
  description:
    "Log an expense that was already paid (everyday spending: groceries, eating out…), e.g. 'I spent 45 euro at Delhaize'. Paid from the joint account unless the person says they paid it themselves.",
  input: z.object({
    payee: z.string().trim().min(1).max(64).describe("Shop or payee, e.g. 'Delhaize'"),
    amount: eurosSchema,
    category: z.enum(EXPENSE_CATEGORIES).describe("Best matching category; 'groceries' for supermarkets"),
    date: optionalDateSchema("Day it was paid, YYYY-MM-DD (default today)"),
    paymentMethod: z.enum(["card", "cash", "meal_voucher", "wire_transfer", "other"]).default("card"),
    paidBy: z.enum(["joint", "me"]).default("joint").describe("joint account, or the person asking paid it personally (always the person for meal vouchers)"),
    description: z.string().trim().max(200).optional(),
  }),
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Logged an expense", nl: "Uitgave genoteerd" },
  describe: (ctx, input) => {
    const amount = money(toCents(input.amount));
    const when = day(input.date ?? todayIn(), ctx.locale, true);
    const who = paidByMe(input) ? say(ctx.locale, "paid by you", "door jou betaald") : say(ctx.locale, "joint account", "gemeenschappelijke rekening");
    return say(ctx.locale, `Log ${amount} at ${input.payee} on ${when} (${who})`, `${amount} bij ${input.payee} noteren op ${when} (${who})`);
  },
  preview: (ctx, input) => ({
    kind: "fields",
    title: say(ctx.locale, "Expense (paid)", "Uitgave (betaald)"),
    data: {
      fields: [
        { label: say(ctx.locale, "Amount", "Bedrag"), value: money(toCents(input.amount)) ?? "" },
        { label: say(ctx.locale, "Payee", "Begunstigde"), value: input.payee },
        { label: say(ctx.locale, "Paid on", "Betaald op"), value: day(input.date ?? todayIn(), ctx.locale) ?? "" },
        { label: say(ctx.locale, "Paid by", "Betaald door"), value: paidByMe(input) ? ctx.user.name : say(ctx.locale, "Joint account", "Gemeenschappelijke rekening") },
        { label: say(ctx.locale, "Method", "Betaalwijze"), value: input.paymentMethod },
        { label: say(ctx.locale, "Category", "Categorie"), value: input.category },
      ],
    },
  }),
  run: async (ctx, input) => {
    const me = paidByMe(input);
    if (me && !ctx.user.habitantId) throw badRequest("This account has no habitant to pay personally");
    const date = input.date ?? todayIn();
    const expense = await createExpense(
      ctx.householdId,
      expenseCreateInputSchema.parse({
        payee: input.payee,
        amountCents: toCents(input.amount),
        category: input.category,
        description: input.description ?? null,
        dueDate: date,
        paidOn: date,
        paymentMethod: input.paymentMethod,
        payerType: me ? "person" : "joint",
        payerHabitantId: me ? ctx.user.habitantId : null,
      }),
    );
    return done(`Logged ${money(expense.amountCents)} at ${expense.payee} on ${day(expense.paidOn ?? date)}.`, { id: expense.id });
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): an expense, a recurring expense and the expenses overview ──

const isoDay = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

registerScreenContext({
  kind: "expense",
  skills: ["expenses"],
  describe: async (ctx, id) => {
    const expense = id
      ? await db.expense.findFirst({ where: { id, householdId: ctx.householdId }, select: { payee: true, amountCents: true, dueDate: true, paidOn: true } })
      : null;
    const paid = expense?.paidOn ? `paid ${day(isoDay(expense.paidOn))}` : "unpaid";
    return expense && { label: expense.payee, summary: `expense "${expense.payee}" (${money(expense.amountCents)}, due ${day(isoDay(expense.dueDate))}, ${paid})` };
  },
});

registerScreenContext({
  kind: "recurring_expense",
  skills: ["expenses"],
  describe: async (ctx, id) => {
    const recurring = id
      ? await db.recurringExpense.findFirst({ where: { id, householdId: ctx.householdId }, select: { payee: true, amountCents: true, status: true, kind: true } })
      : null;
    return (
      recurring && {
        label: recurring.payee,
        summary: `recurring expense "${recurring.payee}" (${money(recurring.amountCents)} per payment, ${recurring.kind.toLowerCase()}, ${recurring.status.toLowerCase()})`,
      }
    );
  },
});

registerScreenContext({
  kind: "expenses",
  skills: ["expenses"],
  describe: (ctx) => ({ label: say(ctx.locale, "Expenses", "Uitgaven"), summary: "the expenses overview (payments, recurring expenses, loans)" }),
});
