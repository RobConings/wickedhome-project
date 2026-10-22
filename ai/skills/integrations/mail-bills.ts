import { z } from "zod";
import { createExpense } from "@/api/expenses/expenses.service";
import { acceptSuggestion, createRule, dismissSuggestion, getLinkOptions, getOccurrenceOptions, linkSuggestion, listPendingSuggestions, listRules, updateRule } from "@/api/integrations/gmail.service";
import { db } from "@/api/lib/db";
import { badRequest, notFound } from "@/api/lib/http";
import { EXPENSE_CATEGORIES, expenseCreateInputSchema, type ExpenseCategory } from "@/features/expenses/types/expenses";
import { mailSenderSchema, type MailBillSuggestion } from "@/features/integrations/types/google";
import { proposeUpdates, type MailLinkInput, type MailLinkTarget, type MailValues } from "@/features/integrations/types/mail-matching";
import { todayIn } from "@/types/dates";
import {
  capList,
  day,
  done,
  entityRef,
  eurosSchema,
  money,
  optionalDateSchema,
  registerAssistantTool,
  registerEntityResolver,
  say,
  toCents,
  type AssistantPreview,
  type AssistantToolContext,
  type ResolvedEntity,
} from "@ai/core/kit";

/**
 * Bills found in the household's mailboxes ("Suggested from mail" on the expenses page), part of the
 * "integrations" skill: list, accept as a new expense (the PDF is attached), link to an existing expense or a
 * recurring expense's occurrence, or dismiss. Owners and adults, as in the app. Accepting and linking are money
 * writes: sensitive, always confirmed, with a preview of the fields. Only the extracted fields are ever shown
 * (payee, amount, dates, subject line), never the mail itself.
 */

const MANAGERS = ["owner", "adult"] as const;

registerEntityResolver({
  type: "mail_suggestion",
  label: "bill suggestion from mail",
  skill: "integrations",
  roles: MANAGERS,
  list: async (ctx) => {
    const rows = await db.mailBillSuggestion.findMany({
      where: { householdId: ctx.householdId, status: "PENDING" },
      select: { id: true, payee: true, subject: true, receivedAt: true, amountCents: true, dueDate: true },
      orderBy: { receivedAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.payee,
      aliases: [row.subject.slice(0, 80)],
      hint: [money(row.amountCents), `mail ${day(row.receivedAt.toISOString())}`].filter(Boolean).join(", "),
      date: row.dueDate?.toISOString().slice(0, 10) ?? row.receivedAt.toISOString().slice(0, 10),
    }));
  },
});

async function pendingSuggestion(ctx: AssistantToolContext, ref: ResolvedEntity): Promise<MailBillSuggestion> {
  const suggestion = (await listPendingSuggestions(ctx.householdId)).find((row) => row.id === ref.id);
  if (!suggestion) throw notFound("This mail suggestion was already handled");
  return suggestion;
}

/** A mailbox owner by name; an e-mail address (an owner without a habitant) is not repeated. */
const ownerName = (value: string) => (value.includes("@") ? "a household member" : value);

const targetText = (target: Pick<MailLinkTarget, "payee" | "dueDate" | "amountCents" | "paidOn">, locale: "en" | "nl") =>
  `${target.payee} ${money(target.amountCents)}, ${say(locale, "due", "vervalt")} ${day(target.dueDate, locale)}${target.paidOn ? say(locale, " (paid)", " (betaald)") : ""}`;

registerAssistantTool({
  name: "integrations.mail_bills",
  description: "Bills found in the household's mail, waiting to be accepted, linked or dismissed: payee, amount, due date, when it arrived, and the expense it probably belongs to.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  roles: MANAGERS,
  activity: { en: "Checked the bills found in mail", nl: "Rekeningen uit mail bekeken" },
  run: async (ctx) => {
    const suggestions = await listPendingSuggestions(ctx.householdId);
    if (!suggestions.length) return { items: [], note: "No bills from mail are waiting." };
    return capList(suggestions, 15, (suggestion) => mailBillRow(suggestion, ctx.locale));
  },
});

/** One suggestion for the model: extracted fields only (no IBAN, no mail body, no e-mail addresses). */
export function mailBillRow(suggestion: MailBillSuggestion, locale: "en" | "nl") {
  const best = suggestion.matches[0];
  return {
    id: suggestion.id,
    payee: suggestion.payee,
    amount: money(suggestion.amountCents) ?? "no amount in the mail",
    due: suggestion.dueDate,
    mail: day(suggestion.receivedAt, locale),
    subject: suggestion.subject.slice(0, 80),
    from: ownerName(suggestion.mailboxOwner),
    pdf: suggestion.attachmentName ? true : null,
    // The expense it most likely belongs to: link instead of accepting a duplicate.
    looksLike: best?.strong ? { expenseId: best.expenseId, recurring: best.recurringExpenseId ? true : null, what: targetText(best, locale) } : null,
  };
}

// ── Accept as a new expense ───────────────────────────────────────────────────────────────────────────

const acceptInput = z.object({
  suggestion: entityRef("mail_suggestion", "The bill from mail by payee (add the date if several), or its id"),
  amount: eurosSchema.optional().describe("Amount in euros, when the mail has none or it must be corrected"),
  dueDate: optionalDateSchema("Due date YYYY-MM-DD (default: the mail's, else today)"),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
});
type AcceptInput = z.output<typeof acceptInput>;

/** The expense the app's form would prefill from the suggestion, with the person's corrections. */
function expenseFrom(suggestion: MailBillSuggestion, input: AcceptInput) {
  const amountCents = input.amount !== undefined ? toCents(input.amount) : suggestion.amountCents;
  if (!amountCents) throw badRequest("The mail has no amount: ask the person how much it is and pass amount.");
  return {
    payee: suggestion.payee.slice(0, 64),
    amountCents,
    dueDate: input.dueDate ?? suggestion.dueDate ?? todayIn(),
    category: (input.category ?? suggestion.category) as ExpenseCategory,
    structuredCommunication: suggestion.structuredCommunication,
    iban: suggestion.iban,
    beneficiaryName: suggestion.iban ? suggestion.payee.slice(0, 70) : null,
    paymentMethod: suggestion.iban || suggestion.structuredCommunication ? ("wire_transfer" as const) : null,
    payerType: "joint" as const,
  };
}

registerAssistantTool({
  name: "integrations.accept_mail_bill",
  description: "Save a bill from mail as a new expense (joint account, unpaid) and attach its PDF. Check integrations_mail_bills first: when it looks like an existing expense, link it instead.",
  input: acceptInput,
  permission: "sensitive",
  confirm: "always",
  roles: MANAGERS,
  activity: { en: "Saved a bill from mail", nl: "Rekening uit mail bewaard" },
  describe: (ctx, input) => say(ctx.locale, `Save the bill from ${input.suggestion.name} as a new expense`, `De rekening van ${input.suggestion.name} als nieuwe uitgave bewaren`),
  preview: async (ctx, input): Promise<AssistantPreview> => {
    const suggestion = await pendingSuggestion(ctx, input.suggestion);
    const expense = expenseFrom(suggestion, input);
    return {
      kind: "fields",
      title: say(ctx.locale, "New expense", "Nieuwe uitgave"),
      data: {
        fields: [
          { label: say(ctx.locale, "Payee", "Begunstigde"), value: expense.payee },
          { label: say(ctx.locale, "Amount", "Bedrag"), value: money(expense.amountCents) ?? "–" },
          { label: say(ctx.locale, "Due", "Vervaldag"), value: day(expense.dueDate, ctx.locale, true) ?? "–" },
          { label: say(ctx.locale, "Category", "Categorie"), value: expense.category },
          { label: say(ctx.locale, "Paid by", "Betaald door"), value: say(ctx.locale, "joint account", "gemeenschappelijke rekening") },
          ...(expense.structuredCommunication ? [{ label: say(ctx.locale, "Structured communication", "Gestructureerde mededeling"), value: expense.structuredCommunication }] : []),
          { label: "PDF", value: suggestion.attachmentName ? say(ctx.locale, "attached from the mail", "uit de mail toegevoegd") : say(ctx.locale, "none", "geen") },
          ...(suggestion.matches[0]?.strong ? [{ label: say(ctx.locale, "Note", "Let op"), value: say(ctx.locale, `looks like ${targetText(suggestion.matches[0], ctx.locale)}`, `lijkt op ${targetText(suggestion.matches[0], ctx.locale)}`) }] : []),
        ],
      },
    };
  },
  run: async (ctx, input) => {
    const suggestion = await pendingSuggestion(ctx, input.suggestion);
    const expense = await createExpense(ctx.householdId, expenseCreateInputSchema.parse(expenseFrom(suggestion, input)));
    const { attached } = await acceptSuggestion(ctx.user, suggestion.id, expense.id);
    return done(`Saved ${money(expense.amountCents)} for ${expense.payee}, due ${day(expense.dueDate)}${attached ? ", with the PDF" : "; the PDF couldn't be fetched"}.`, { id: expense.id });
  },
});

// ── Link to an existing expense ───────────────────────────────────────────────────────────────────────

const linkInput = z.object({
  suggestion: entityRef("mail_suggestion", "The bill from mail by payee, or its id"),
  expenseId: z.string().min(1).max(64).optional().describe("An expense id from integrations_mail_bills (looksLike)"),
  recurring: entityRef("recurring_expense", "A recurring expense by name: links to its occurrence nearest the mail").optional(),
  dueDate: optionalDateSchema("The recurring expense's occurrence YYYY-MM-DD (default: the nearest)"),
  updateFromMail: z.boolean().default(true).describe("Take amount, due date and structured communication from the mail when they differ (unpaid expenses)"),
});
type LinkInput = z.output<typeof linkInput>;

const valuesOf = (suggestion: MailBillSuggestion): MailValues => ({
  payee: suggestion.payee,
  amountCents: suggestion.amountCents,
  dueDate: suggestion.dueDate,
  structuredCommunication: suggestion.structuredCommunication,
  iban: suggestion.iban,
});

/** Where the mail goes: the given expense, a recurring expense's occurrence, or the clear best match. */
async function linkPlan(ctx: AssistantToolContext, input: LinkInput) {
  const suggestion = await pendingSuggestion(ctx, input.suggestion);
  let target: MailLinkTarget | undefined;
  if (input.expenseId) {
    const options = await getLinkOptions(ctx.householdId, suggestion.id);
    target = [...options.matches, ...options.expenses].find((row) => row.expenseId === input.expenseId);
    if (!target) throw badRequest("That expense isn't one this mail can be linked to. Use an expenseId from integrations_mail_bills, or a recurring expense.");
  } else if (input.recurring) {
    const { occurrences, suggested } = await getOccurrenceOptions(ctx.householdId, suggestion.id, input.recurring.id);
    const date = input.dueDate ?? suggested;
    target = occurrences.find((row) => row.dueDate === date);
    if (!target) throw badRequest(`No occurrence of ${input.recurring.name} on ${day(date ?? null) ?? "that date"}. Occurrences: ${occurrences.map((row) => day(row.dueDate)).join(", ") || "none"}.`);
  } else {
    target = suggestion.matches.find((match) => match.strong);
    if (!target) throw badRequest("No clear match for this mail: give an expenseId from integrations_mail_bills or a recurring expense, or accept it as a new expense.");
  }
  const updates = input.updateFromMail ? proposeUpdates(target, valuesOf(suggestion)).filter((update) => update.defaultOn) : [];
  const link: MailLinkInput = {
    target: target.expenseId ? { expenseId: target.expenseId } : { recurringExpenseId: target.recurringExpenseId ?? "", dueDate: target.dueDate },
    apply: updates.map((update) => update.field),
    allowPaidChanges: false,
    updateRecurring: [],
  };
  return { suggestion, target, updates, link };
}

const fieldValue = (field: string, value: string | number | null, locale: "en" | "nl") =>
  value === null ? "–" : field === "amount" ? (money(Number(value)) ?? "–") : field === "dueDate" ? (day(String(value), locale) ?? "–") : String(value);

registerAssistantTool({
  name: "integrations.link_mail_bill",
  description:
    "Link a bill from mail to an expense that already exists (its looksLike expenseId, or a recurring expense's occurrence) instead of creating a duplicate; attaches the PDF and can take amount and due date from the mail.",
  input: linkInput,
  permission: "sensitive",
  confirm: "always",
  roles: MANAGERS,
  activity: { en: "Linked a bill from mail", nl: "Rekening uit mail gekoppeld" },
  describe: (ctx, input) =>
    say(
      ctx.locale,
      `Link the bill from ${input.suggestion.name} to ${input.recurring?.name ?? "the matching expense"}`,
      `De rekening van ${input.suggestion.name} koppelen aan ${input.recurring?.name ?? "de passende uitgave"}`,
    ),
  preview: async (ctx, input): Promise<AssistantPreview> => {
    const { suggestion, target, updates } = await linkPlan(ctx, input);
    return {
      kind: "fields",
      title: say(ctx.locale, "Link to an existing expense", "Koppelen aan een bestaande uitgave"),
      data: {
        fields: [
          { label: say(ctx.locale, "Mail", "Mail"), value: `${suggestion.payee} ${money(suggestion.amountCents) ?? ""} (${day(suggestion.receivedAt, ctx.locale)})`.trim() },
          { label: say(ctx.locale, "Expense", "Uitgave"), value: `${targetText(target, ctx.locale)}${target.expenseId ? "" : say(ctx.locale, " (created now)", " (wordt aangemaakt)")}` },
          ...updates.map((update) => ({ label: update.field, value: `${fieldValue(update.field, update.before, ctx.locale)} → ${fieldValue(update.field, update.after, ctx.locale)}` })),
          { label: "PDF", value: suggestion.attachmentName ? say(ctx.locale, "attached from the mail", "uit de mail toegevoegd") : say(ctx.locale, "none", "geen") },
        ],
      },
    };
  },
  run: async (ctx, input) => {
    const { suggestion, target, link } = await linkPlan(ctx, input);
    const result = await linkSuggestion(ctx.user, suggestion.id, link);
    const changed = result.updated.length ? `; updated ${result.updated.join(", ")}` : "";
    return done(`Linked the mail from ${suggestion.payee} to ${target.payee} due ${day(target.dueDate)}${changed}${result.attached ? ", PDF attached" : ""}.`, { id: result.expenseId });
  },
});

registerAssistantTool({
  name: "integrations.dismiss_mail_bill",
  description: "Dismiss a bill found in mail that isn't a bill to pay (it disappears from the suggestions).",
  input: z.object({ suggestion: entityRef("mail_suggestion", "The bill from mail by payee, or its id") }),
  permission: "write",
  confirm: "always",
  roles: MANAGERS,
  activity: { en: "Dismissed a bill from mail", nl: "Rekening uit mail genegeerd" },
  describe: (ctx, input) => say(ctx.locale, `Dismiss the mail suggestion from ${input.suggestion.name}`, `Het mailvoorstel van ${input.suggestion.name} negeren`),
  run: async (ctx, input) => {
    await dismissSuggestion(ctx.householdId, input.suggestion.id);
    return done(`Dismissed the mail suggestion from ${input.suggestion.name}.`);
  },
});

// ── Which mails count as bills (the "Senders" dialog) ─────────────────────────────────────────────────

registerAssistantTool({
  name: "integrations.save_mail_rule",
  description: "Which mails count as bills: add or change a payee's senders (addresses or domains such as 'fluvius.be'), its category, or switch it off. Merges into the payee's existing rule.",
  input: z.object({
    payee: z.string().trim().min(1).max(80),
    senders: z.array(mailSenderSchema).max(10).default([]).describe("Sender addresses or domains to add, e.g. ['facturen@telenet.be']"),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    enabled: z.boolean().optional(),
  }),
  permission: "write",
  confirm: "always",
  roles: MANAGERS,
  activity: { en: "Saved a mail sender rule", nl: "Afzenderregel bewaard" },
  describe: (ctx, input) => say(ctx.locale, `Mails from ${input.senders.join(", ") || "its senders"} count as bills of ${input.payee}`, `Mails van ${input.senders.join(", ") || "de afzenders"} gelden als rekeningen van ${input.payee}`),
  run: async (ctx, input) => {
    const existing = (await listRules(ctx.householdId)).find((rule) => rule.payee.toLowerCase() === input.payee.toLowerCase());
    const senders = [...new Set([...(existing?.senders ?? []), ...input.senders])];
    if (!senders.length) throw badRequest("Give at least one sender address or domain.");
    const body = { payee: existing?.payee ?? input.payee, senders, category: input.category ?? existing?.category ?? "other", enabled: input.enabled ?? existing?.enabled ?? true };
    const rule = existing ? await updateRule(ctx.householdId, existing.id, body) : await createRule(ctx.householdId, body);
    return done(`${rule.payee}: ${rule.senders.join(", ")} (${rule.category})${rule.enabled ? "" : ", switched off"}.`);
  },
});
