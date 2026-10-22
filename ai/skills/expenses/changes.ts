import { z } from "zod";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_KINDS,
  PAYMENT_METHODS,
  expenseCreateInputSchema,
  expenseInputSchema,
  recurringExpenseInputSchema,
  type Expense,
  type RecurringExpense,
} from "@/features/expenses/types/expenses";
import { formatIban, formatStructuredCommunication } from "@/features/expenses/types/payment-references";
import { previewTotalOpen, totalOpenPreviewFor, withUntil } from "@/features/expenses/types/total-open";
import { addDays, todayIn } from "@/types/dates";
import { parseRRule } from "@/types/recurrence";
import {
  createExpense,
  deleteExpense,
  deleteRecurringExpense,
  getExpenseDetail,
  getRecurringExpenseDetail,
  listUnpaidExpenses,
  markExpensePaid,
  markExpenseUnpaid,
  setRecurringStatus,
  updateExpense,
  updateRecurringExpense,
} from "@/api/expenses/expenses.service";
import { badRequest } from "@/api/lib/http";
import { getLinkedTaskDetail, holdTask, releaseTask } from "@/api/tasks/tasks.service";
import {
  dateSchema,
  day,
  done,
  entityNames,
  entityRef,
  eurosSchema,
  money,
  optionalDateSchema,
  registerAssistantTool,
  say,
  toCents,
  type AssistantToolContext,
  type ResolvedEntity,
} from "@ai/core/kit";
import { MONEY_ROLES, REPEATS, communicationFields, fieldsPreview, methodText, payerArgs, payerFields, payerText, rhythm, rruleFor, type Repeat } from "./shared";

/**
 * Changes to expenses (skill "expenses"): add a bill or recurring expense, edit, mark paid or not, delete,
 * put the pay task on hold. Money, so every one is confirmed on a card that shows what will be recorded.
 * Validation and the business rules are the expenses contract's and service's (`expenseCreateInputSchema`,
 * `updateRecurringExpense`, total-open planning…); the tools only build their input.
 */

const paymentArgs = {
  paymentMethod: z.enum(PAYMENT_METHODS).optional().describe("direct_debit = domiciliëring (paid automatically), wire_transfer = overschrijving"),
  iban: z.string().trim().max(42).optional().describe("Beneficiary IBAN, exactly as given"),
  beneficiary: z.string().trim().max(70).optional().describe("Account holder, when not the payee"),
  communication: z.string().trim().max(140).optional().describe("Structured communication (+++123/4567/89002+++) or free reference, exactly as given"),
};

const optionalText = (value: string | undefined) => (value === undefined ? undefined : value || null);

// ── Add ─────────────────────────────────────────────────────────────────────────────────────────────

const addInput = z.object({
  payee: z.string().trim().min(1).max(64),
  amount: eurosSchema.describe("Amount (of each payment) in euros"),
  dueDate: dateSchema("Due date, for recurring the first one, YYYY-MM-DD"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(200).optional(),
  repeat: z.enum(REPEATS).optional().describe("Recurring: how often. Leave out for a one-off bill"),
  kind: z.enum(EXPENSE_KINDS).optional().describe("Recurring: subscription, loan, down_payment (afbetaling), insurance…"),
  payments: z.number().int().min(1).max(999).optional().describe("Recurring: number of payments, when it ends"),
  totalOpen: eurosSchema.optional().describe("Loans: total still to pay off; the last payment becomes the rest"),
  ...paymentArgs,
  ...payerArgs,
  project: entityRef("project").optional(),
});
type AddInput = z.output<typeof addInput>;

function createInputOf(ctx: AssistantToolContext, input: AddInput) {
  if (!input.repeat && (input.kind || input.payments || input.totalOpen)) throw badRequest("kind, payments and totalOpen are for recurring expenses: set repeat too");
  const amountCents = toCents(input.amount);
  return expenseCreateInputSchema.parse({
    payee: input.payee,
    description: input.description ?? null,
    amountCents,
    category: input.category,
    paymentMethod: input.paymentMethod ?? null,
    beneficiaryName: input.beneficiary ?? null,
    iban: input.iban || null,
    ...communicationFields(input.communication ?? null),
    ...payerFields(input, amountCents, ctx.user.habitantId),
    projectId: input.project?.id ?? null,
    dueDate: input.dueDate,
    rrule: input.repeat ? rruleFor(input.repeat, { count: input.totalOpen ? null : input.payments }) : null,
    kind: input.kind ?? (input.totalOpen ? "loan" : "other"),
    totalOpenCents: input.repeat && input.totalOpen ? toCents(input.totalOpen) : null,
  });
}

/** "12 payments: 11 × € 853,17 + last € 615,13 on 05/02/2027", or null. */
function loanPlanText(plan: ReturnType<typeof previewTotalOpen>, locale: "en" | "nl") {
  if (!plan) return null;
  const last = plan.lastDate ? ` ${say(locale, "on", "op")} ${day(plan.lastDate, locale)}` : "";
  const partial = plan.partial ? `${plan.regularCount} × ${money(plan.regularCents)} + ${say(locale, "last", "laatste")} ${money(plan.lastCents)}` : `${plan.count} × ${money(plan.regularCents)}`;
  return `${plan.count} ${say(locale, "payments", "betalingen")}: ${partial}${last}`;
}

async function payerLabel(ctx: AssistantToolContext, fields: { payerType: Expense["payerType"]; payerHabitantId?: string | null; shares: Expense["shares"] }) {
  const text = payerText(fields, await entityNames(ctx, "habitant"));
  return text === "joint account" ? say(ctx.locale, "Joint account", "Gemeenschappelijke rekening") : text;
}

registerAssistantTool({
  name: "expenses.add",
  description:
    "Add a bill to pay (one-off) or a recurring expense (subscription, loan, insurance; set repeat). With payment details (method, IBAN, OGM/reference) and who pays (joint, a person, split). Not for spending already paid: use expenses_log.",
  input: addInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Added an expense", nl: "Uitgave toegevoegd" },
  describe: (ctx, input) => {
    const amount = money(toCents(input.amount));
    const when = day(input.dueDate, ctx.locale);
    return input.repeat
      ? say(ctx.locale, `Add ${input.payee}: ${amount} ${input.repeat}, first on ${when}`, `${input.payee} toevoegen: ${amount} ${input.repeat}, eerste keer op ${when}`)
      : say(ctx.locale, `Add a bill of ${amount} from ${input.payee}, due ${when}`, `Rekening van ${amount} van ${input.payee} toevoegen, te betalen op ${when}`);
  },
  preview: async (ctx, input) => {
    const data = createInputOf(ctx, input);
    const plan = data.rrule && data.totalOpenCents ? previewTotalOpen({ amountCents: data.amountCents, totalOpenCents: data.totalOpenCents, rrule: data.rrule, startDate: data.dueDate, from: data.dueDate }) : null;
    return fieldsPreview(ctx.locale, input.repeat ? ["New recurring expense", "Nieuwe terugkerende uitgave"] : ["New bill", "Nieuwe rekening"], [
      [["Payee", "Begunstigde"], data.payee],
      [["Amount", "Bedrag"], `${money(data.amountCents)}${data.rrule ? ` · ${rhythm(data.rrule)}` : ""}`],
      [[data.rrule ? "First due" : "Due", data.rrule ? "Eerste vervaldag" : "Vervaldag"], day(data.dueDate, ctx.locale)],
      [["Loan", "Lening"], data.totalOpenCents ? `${money(data.totalOpenCents)} · ${loanPlanText(plan, ctx.locale)}` : null],
      [["Paid by", "Betaald door"], await payerLabel(ctx, data)],
      [["Method", "Betaalwijze"], data.paymentMethod ? methodText(data.paymentMethod) : null],
      [["IBAN", "IBAN"], data.iban ? formatIban(data.iban) : null],
      [["Communication", "Mededeling"], data.structuredCommunication ? formatStructuredCommunication(data.structuredCommunication) : data.reference],
      [["Category", "Categorie"], data.category],
      [["Project", "Project"], input.project?.name],
    ]);
  },
  run: async (ctx, input) => {
    const expense = await createExpense(ctx.householdId, createInputOf(ctx, input));
    const what = input.repeat ? `${input.payee} (${input.repeat}), first ${money(expense.amountCents)} due ${day(expense.dueDate)}` : `${input.payee} ${money(expense.amountCents)}, due ${day(expense.dueDate)}`;
    return done(`Added ${what}.`, { id: expense.id });
  },
});

// ── Edit ────────────────────────────────────────────────────────────────────────────────────────────

const editInput = z.object({
  expense: entityRef("expense", "One bill or one payment of a recurring expense, by payee (add a date for another one)").optional(),
  recurring: entityRef("recurring_expense", "A recurring expense: changes it from now on (this and all upcoming payments)").optional(),
  payee: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(200).optional(),
  amount: eurosSchema.optional(),
  dueDate: optionalDateSchema("expense: new due date; recurring: new first due date (rare)"),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  repeat: z.enum(REPEATS).optional().describe("recurring: new rhythm"),
  kind: z.enum(EXPENSE_KINDS).optional(),
  totalOpen: z.number().min(0).max(1_000_000).optional().describe("recurring loans: total still to pay off in euros (0 removes it)"),
  ...paymentArgs,
  ...payerArgs,
  project: entityRef("project", "Link it to this project").optional(),
  cancelCandidate: z.boolean().optional().describe("recurring: flag as candidate to cancel"),
  status: z.enum(["active", "paused", "ended"]).optional().describe("recurring: pause, resume (active) or end (stop) it"),
  endDate: optionalDateSchema("status ended: last day (default today)"),
});
type EditInput = z.output<typeof editInput>;

/** The fields of a recurring template besides its status. */
const TEMPLATE_KEYS = ["payee", "description", "amount", "dueDate", "category", "repeat", "kind", "totalOpen", "paymentMethod", "iban", "beneficiary", "communication", "payer", "person", "splitWith", "project", "cancelCandidate"] as const;
const changesTemplate = (input: EditInput) => TEMPLATE_KEYS.some((key) => input[key] !== undefined);

/** The rule with another rhythm, keeping how it ends. */
function withRepeat(rrule: string, repeat: Repeat | undefined): string {
  if (!repeat) return rrule;
  const rule = parseRRule(rrule);
  return rruleFor(repeat, { count: rule?.count ?? null, until: rule?.until ?? null });
}

/** Shared part of the edit inputs: the existing payment details, with what the person changes. */
function paymentChanges(ctx: AssistantToolContext, input: EditInput, existing: Expense | RecurringExpense) {
  const amountCents = input.amount ? toCents(input.amount) : existing.amountCents;
  const ibanChanged = input.iban !== undefined;
  return {
    payee: input.payee ?? existing.payee,
    description: optionalText(input.description) ?? existing.description,
    amountCents,
    category: input.category ?? existing.category,
    paymentMethod: input.paymentMethod ?? existing.paymentMethod,
    beneficiaryName: optionalText(input.beneficiary) ?? existing.beneficiaryName,
    iban: ibanChanged ? input.iban || null : existing.iban,
    bic: ibanChanged ? null : existing.bic,
    structuredCommunication: existing.structuredCommunication,
    reference: existing.reference,
    ...communicationFields(input.communication),
    ...payerFields(input, amountCents, ctx.user.habitantId, existing),
    notes: existing.notes,
    projectId: input.project?.id,
  };
}

type EditPlan =
  | { type: "expense"; before: Expense; after: z.output<typeof expenseInputSchema> }
  | { type: "recurring"; before: RecurringExpense; after: z.output<typeof recurringExpenseInputSchema> | null };

async function planEdit(ctx: AssistantToolContext, input: EditInput): Promise<EditPlan> {
  if (input.expense) {
    if (input.repeat || input.kind || input.totalOpen !== undefined || input.status || input.cancelCandidate !== undefined) {
      throw badRequest("repeat, kind, totalOpen, status and cancelCandidate belong to the recurring expense: pass recurring instead of expense");
    }
    const { expense } = await getExpenseDetail(ctx.householdId, input.expense.id);
    const after = expenseInputSchema.parse({ ...paymentChanges(ctx, input, expense), dueDate: input.dueDate ?? expense.dueDate, shopId: expense.shopId });
    return { type: "expense", before: expense, after };
  }
  if (!input.recurring) throw badRequest("Name the bill (expense) or the recurring expense (recurring) to change");
  const { recurring } = await getRecurringExpenseDetail(ctx.householdId, input.recurring.id);
  if (!changesTemplate(input)) {
    if (!input.status) throw badRequest("Nothing to change");
    return { type: "recurring", before: recurring, after: null };
  }
  const removeTotal = input.totalOpen === 0;
  let rrule = withRepeat(recurring.rrule, input.repeat);
  if (removeTotal) rrule = withUntil(rrule, null);
  const after = recurringExpenseInputSchema.parse({
    ...paymentChanges(ctx, input, recurring),
    kind: input.kind ?? recurring.kind,
    websiteUrl: recurring.websiteUrl,
    trialEndsOn: recurring.trialEndsOn,
    remindDaysBefore: recurring.remindDaysBefore,
    candidateToCancel: input.cancelCandidate ?? recurring.candidateToCancel,
    totalOpenCents: input.totalOpen === undefined ? undefined : removeTotal ? null : toCents(input.totalOpen),
    startDate: input.dueDate ?? recurring.startDate,
    rrule,
  });
  return { type: "recurring", before: recurring, after };
}

const editTarget = (input: EditInput) => input.expense?.name ?? input.recurring?.name ?? "";

registerAssistantTool({
  name: "expenses.edit",
  description:
    "Change a bill (expense) or a recurring expense from now on (recurring): amount, due date, payee, category, payment details, who pays, project; pause, resume or end a recurring one. Only pass what changes.",
  input: editInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Changed an expense", nl: "Uitgave gewijzigd" },
  describe: (ctx, input) =>
    input.recurring
      ? say(ctx.locale, `Change ${editTarget(input)} (this and upcoming payments)`, `${editTarget(input)} wijzigen (deze en volgende betalingen)`)
      : say(ctx.locale, `Change ${editTarget(input)}`, `${editTarget(input)} wijzigen`),
  preview: async (ctx, input) => {
    const plan = await planEdit(ctx, input);
    const before = plan.before;
    const after = plan.after;
    const change = (from: string | null | undefined, to: string | null | undefined) => ((from ?? "") === (to ?? "") ? null : `${from || "–"} → ${to || "–"}`);
    const names = await entityNames(ctx, "habitant");
    const rows: Parameters<typeof fieldsPreview>[2] = [];
    if (after) {
      const comm = (value: { structuredCommunication?: string | null; reference?: string | null }) =>
        value.structuredCommunication ? formatStructuredCommunication(value.structuredCommunication) : (value.reference ?? null);
      rows.push(
        [["Payee", "Begunstigde"], change(before.payee, after.payee)],
        [["Amount", "Bedrag"], change(money(before.amountCents), money(after.amountCents))],
        [["Category", "Categorie"], change(before.category, after.category)],
        [["Method", "Betaalwijze"], change(methodText(before.paymentMethod), methodText(after.paymentMethod ?? null))],
        [["IBAN", "IBAN"], change(before.iban ? formatIban(before.iban) : null, after.iban ? formatIban(after.iban) : null)],
        [["Communication", "Mededeling"], change(comm(before), comm(after))],
        [["Paid by", "Betaald door"], change(payerText(before, names), payerText(after, names))],
      );
      if (plan.type === "expense") rows.push([["Due", "Vervaldag"], change(day(plan.before.dueDate, ctx.locale), day(plan.after.dueDate, ctx.locale))]);
      if (plan.type === "recurring" && plan.after) {
        rows.push([["Rhythm", "Ritme"], change(rhythm(plan.before.rrule), rhythm(plan.after.rrule))]);
        if (plan.after.totalOpenCents !== undefined) {
          const preview = plan.after.totalOpenCents
            ? totalOpenPreviewFor({ amountCents: plan.after.amountCents, totalCents: plan.after.totalOpenCents, asOf: "", rrule: plan.after.rrule, startDate: plan.after.startDate, nextDueDate: plan.before.nextDueDate })
            : null;
          rows.push([["Loan", "Lening"], plan.after.totalOpenCents ? `${money(plan.after.totalOpenCents)} · ${loanPlanText(preview, ctx.locale)}` : say(ctx.locale, "total removed", "totaal verwijderd")]);
        }
      }
      if (input.project) rows.push([["Project", "Project"], input.project.name]);
    }
    if (input.status) rows.push([["Status", "Status"], `${input.status}${input.status === "ended" ? ` ${day(input.endDate ?? todayIn(), ctx.locale)}` : ""}`]);
    return fieldsPreview(ctx.locale, [`Change ${editTarget(input)}`, `${editTarget(input)} wijzigen`], rows);
  },
  run: async (ctx, input) => {
    const plan = await planEdit(ctx, input);
    if (plan.type === "expense") {
      const expense = await updateExpense(ctx.householdId, plan.before.id, plan.after);
      return done(`Changed ${expense.payee}: ${money(expense.amountCents)}, due ${day(expense.dueDate)}.`, { id: expense.id });
    }
    let recurring = plan.before;
    if (plan.after) recurring = await updateRecurringExpense(ctx.householdId, plan.before.id, plan.after);
    if (input.status) recurring = await setRecurringStatus(ctx.householdId, plan.before.id, { status: input.status, endDate: input.endDate ?? null });
    const next = recurring.nextDueDate ? `, next ${day(recurring.nextDueDate)}` : "";
    return done(`Changed ${recurring.payee}: ${money(recurring.amountCents)} ${rhythm(recurring.rrule)}, ${recurring.status}${next}.`, { id: recurring.id });
  },
});

// ── Paid / not paid ─────────────────────────────────────────────────────────────────────────────────

/**
 * The expense to mark. "Not paid after all" on a name that resolved to the next unpaid payment means the
 * latest paid one of the same recurring expense (or payee).
 */
async function paymentTarget(ctx: AssistantToolContext, ref: ResolvedEntity, paid: boolean): Promise<Expense> {
  const detail = await getExpenseDetail(ctx.householdId, ref.id);
  const expense = detail.expense;
  if (paid && expense.paidOn) throw badRequest(`${expense.payee} (due ${day(expense.dueDate)}) was already paid on ${day(expense.paidOn)}`);
  if (paid || expense.paidOn) return expense;
  const latestPaid = detail.history.filter((item) => item.paidOn).sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? ""))[0];
  if (!latestPaid) throw badRequest(`${expense.payee} (due ${day(expense.dueDate)}) is not paid`);
  return latestPaid;
}

const markInput = z.object({
  expense: entityRef("expense", "The bill by payee, e.g. 'Fluvius' (add a date for another payment), or id"),
  paid: z.boolean().default(true).describe("false: not paid after all"),
  paidOn: optionalDateSchema("Day it was paid, YYYY-MM-DD (default today; not in the future)"),
  paidBy: entityRef("habitant", "Who paid it (default the person asking)").optional(),
});

registerAssistantTool({
  name: "expenses.mark_paid",
  description: "Mark a bill as paid (with the day), or as not paid after all (paid: false).",
  input: markInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Updated a payment", nl: "Betaling bijgewerkt" },
  describe: async (ctx, input) => {
    const expense = await paymentTarget(ctx, input.expense, input.paid);
    const what = `${expense.payee} ${money(expense.amountCents)} (${say(ctx.locale, "due", "vervalt")} ${day(expense.dueDate, ctx.locale)})`;
    return input.paid
      ? say(ctx.locale, `Mark ${what} as paid on ${day(input.paidOn ?? todayIn(), ctx.locale)}`, `${what} als betaald markeren op ${day(input.paidOn ?? todayIn(), ctx.locale)}`)
      : say(ctx.locale, `Mark ${what} as not paid`, `${what} als niet betaald markeren`);
  },
  preview: async (ctx, input) => {
    const expense = await paymentTarget(ctx, input.expense, input.paid);
    return fieldsPreview(ctx.locale, input.paid ? ["Paid", "Betaald"] : ["Not paid after all", "Toch niet betaald"], [
      [["Payee", "Begunstigde"], expense.payee],
      [["Amount", "Bedrag"], money(expense.amountCents)],
      [["Due", "Vervaldag"], day(expense.dueDate, ctx.locale)],
      [["Paid on", "Betaald op"], input.paid ? day(input.paidOn ?? todayIn(), ctx.locale) : `${day(expense.paidOn, ctx.locale)} → –`],
      [["Paid by", "Betaald door"], input.paid ? (input.paidBy?.name ?? ctx.user.name) : null],
    ]);
  },
  run: async (ctx, input) => {
    const expense = await paymentTarget(ctx, input.expense, input.paid);
    if (!input.paid) {
      await markExpenseUnpaid(ctx.householdId, expense.id);
      return done(`${expense.payee} ${money(expense.amountCents)} (due ${day(expense.dueDate)}) is unpaid again.`, { id: expense.id });
    }
    const paidOn = input.paidOn ?? todayIn();
    if (paidOn > todayIn()) throw badRequest("The payment day can't be in the future");
    await markExpensePaid(ctx.householdId, expense.id, { paidOn, paidById: input.paidBy?.id ?? ctx.user.habitantId ?? null });
    return done(`Marked ${expense.payee} ${money(expense.amountCents)} as paid on ${day(paidOn)}.`, { id: expense.id });
  },
});

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────────

const deleteInput = z.object({
  expense: entityRef("expense", "One bill or payment by payee (add a date for another one)").optional(),
  recurring: entityRef("recurring_expense", "A whole recurring expense: removes it and its unpaid upcoming payments").optional(),
});

/** Unpaid upcoming payments a recurring delete removes (paid ones stay as history). */
async function upcomingOf(ctx: AssistantToolContext, recurringId: string) {
  const today = todayIn();
  const unpaid = await listUnpaidExpenses(ctx.householdId, addDays(today, 400));
  return unpaid.filter((expense) => expense.recurringExpenseId === recurringId && expense.dueDate >= today);
}

registerAssistantTool({
  name: "expenses.delete",
  description: "Delete one bill (expense), or a whole recurring expense with its unpaid upcoming payments (paid ones stay). To stop a subscription but keep it, prefer expenses_edit status ended.",
  input: deleteInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Deleted an expense", nl: "Uitgave verwijderd" },
  describe: (ctx, input) => {
    const name = input.expense?.name ?? input.recurring?.name ?? "";
    return input.recurring
      ? say(ctx.locale, `Delete the recurring expense ${name} and its unpaid upcoming payments`, `Terugkerende uitgave ${name} en haar onbetaalde volgende betalingen verwijderen`)
      : say(ctx.locale, `Delete ${name}${input.expense?.hint ? ` (${input.expense.hint})` : ""}`, `${name}${input.expense?.hint ? ` (${input.expense.hint})` : ""} verwijderen`);
  },
  preview: async (ctx, input) => {
    if (input.recurring) {
      const upcoming = await upcomingOf(ctx, input.recurring.id);
      return {
        kind: "list",
        title: say(ctx.locale, `${upcoming.length} unpaid payments removed (paid ones stay)`, `${upcoming.length} onbetaalde betalingen verwijderd (betaalde blijven)`),
        data: { items: upcoming.slice(0, 12).map((expense) => ({ label: `${expense.payee} ${money(expense.amountCents)}`, detail: day(expense.dueDate, ctx.locale) ?? "", tone: "remove" })) },
      };
    }
    if (!input.expense) return null;
    const { expense } = await getExpenseDetail(ctx.householdId, input.expense.id);
    return {
      kind: "list",
      title: say(ctx.locale, "Deleted", "Verwijderd"),
      data: { items: [{ label: `${expense.payee} ${money(expense.amountCents)}`, detail: expense.paidOn ? `${say(ctx.locale, "paid", "betaald")} ${day(expense.paidOn, ctx.locale)}` : (day(expense.dueDate, ctx.locale) ?? ""), tone: "remove" }] },
    };
  },
  run: async (ctx, input) => {
    if (input.recurring) {
      await deleteRecurringExpense(ctx.householdId, input.recurring.id);
      return done(`Deleted the recurring expense ${input.recurring.name}; paid payments stay in the history.`);
    }
    if (!input.expense) throw badRequest("Name the bill (expense) or the recurring expense (recurring) to delete");
    const { expense } = await getExpenseDetail(ctx.householdId, input.expense.id);
    await deleteExpense(ctx.householdId, expense.id);
    return done(`Deleted ${expense.payee} ${money(expense.amountCents)} (due ${day(expense.dueDate)}).`);
  },
});

// ── On hold ─────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "expenses.hold",
  description: "Put the pay task of a bill on hold with a reason (e.g. disputed, waiting for a credit note), or release it (hold: false). Direct debits have no pay task.",
  input: z.object({
    expense: entityRef("expense", "The bill by payee (add a date for another payment)"),
    hold: z.boolean().default(true),
    reason: z.string().trim().max(300).optional(),
  }),
  permission: "write",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Changed a bill's hold", nl: "Wachtstatus van een rekening gewijzigd" },
  describe: (ctx, input) =>
    input.hold
      ? say(ctx.locale, `Put paying ${input.expense.name} on hold${input.reason ? `: ${input.reason}` : ""}`, `Betalen van ${input.expense.name} on hold zetten${input.reason ? `: ${input.reason}` : ""}`)
      : say(ctx.locale, `Release the hold on paying ${input.expense.name}`, `Betalen van ${input.expense.name} niet langer on hold`),
  run: async (ctx, input) => {
    const linked = await getLinkedTaskDetail(ctx.user, "expense", input.expense.id);
    if (!linked) throw badRequest(`${input.expense.name} has no pay task to hold (direct debits and paid bills have none)`);
    if (input.hold) await holdTask(ctx.user, linked.task.id, { reason: input.reason ?? null });
    else await releaseTask(ctx.user, linked.task.id);
    return done(input.hold ? `Paying ${input.expense.name} is on hold${input.reason ? `: ${input.reason}` : ""}.` : `Paying ${input.expense.name} is no longer on hold.`);
  },
});
