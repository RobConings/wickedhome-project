import { z } from "zod";
import { monthBounds, planActiveIn } from "@/features/money/types/money-calculations";
import { contributionPlanSchema, type JointAccount, type LedgerLine, type MoneyMonth } from "@/features/money/types/money";
import { addDays, addMonthsClamped, monthOf, todayIn } from "@/types/dates";
import { db } from "@/api/lib/db";
import { badRequest } from "@/api/lib/http";
import {
  addOtherEntry,
  createPlan,
  deleteEntry,
  deletePlan,
  getMoneyLoans,
  getMoneyMonth,
  getMoneyTimeline,
  listJointAccounts,
  recordDirectPayment,
  recordTransfer,
  setBalance,
  setKeptExtra,
  takeBackContribution,
  updatePlan,
} from "@/api/money/money.service";
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
  registerAssistantSkill,
  registerAssistantTool,
  registerScreenContext,
  say,
  toCents,
  type AssistantToolContext,
  type ResolvedEntity,
} from "@ai/core/kit";
import { MONEY_ROLES, fieldsPreview } from "../expenses/shared";
import { balanceOn, defaultAccount, monthCoverage, monthSettlements } from "./coverage";

/**
 * Skill "money": the joint current and savings accounts (balances, history, corrections), contributions per
 * person (planned vs transferred, settling the month, coverage of the joint costs), loans and the month
 * timeline (guide: guide.md). All numbers come from the money service and its pure helpers; nothing is
 * computed differently than on the money flow page. Like income, adults only.
 */

registerAssistantSkill({
  id: "money",
  title: { en: "Money flow", nl: "Geldstroom" },
  summary: "Joint and savings account balances and history, contributions per person (planned vs transferred, still to transfer), corrections, loans, monthly timeline.",
  keywords: {
    nl: ["gezamenlijke rekening", "gemeenschappelijke rekening", "spaarrekening", "saldo", "bijdrage", "bijdragen", "bijgedragen", "overgeschreven", "overgemaakt", "storten", "gestort", "storting", "correctie", "geldstroom", "tekort", "afrekenen", "lening", "leningen", "openstaand", "terugnemen", "rente", "afgelost", "maandoverzicht", "inkomsten en uitgaven", "komende maanden"],
    en: ["joint account", "savings account", "balance", "contribution", "contributions", "contributed", "transferred", "deposit", "correction", "money flow", "shortfall", "settle", "loan", "loans", "outstanding", "take back", "interest", "repaid", "income and expenses", "coming months"],
  },
  roles: MONEY_ROLES,
});

const LIMIT = 30;
const currentMonth = () => monthOf(todayIn());
const optionalMonth = monthSchema("Month YYYY-MM (default this month)").optional();
const accountArg = entityRef("account", "Joint account by name (default the joint current account)").optional();

async function accountsOf(ctx: AssistantToolContext) {
  const accounts = await listJointAccounts(ctx.householdId);
  if (!accounts.length) throw badRequest("No joint accounts yet: set them up on the money flow page first");
  return accounts;
}

/** The named joint account, else the default joint current account. */
function pickAccount(accounts: JointAccount[], ref: ResolvedEntity | undefined): JointAccount {
  const account = ref ? accounts.find((item) => item.id === ref.id) : defaultAccount(accounts);
  if (!account) throw badRequest(ref ? `${ref.name} is not a joint or savings account` : "No joint current account yet");
  return account;
}

const monthsApart = (from: string, to: string) => Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)));
const signed = (cents: number) => `${cents > 0 ? "+" : ""}${money(cents)}`;

function lineText(line: LedgerLine, names: Map<string, string>, accounts: JointAccount[]): string {
  const who = line.habitantId ? names.get(line.habitantId) : null;
  const other = line.counterpartAccountId ? accounts.find((account) => account.id === line.counterpartAccountId)?.name : null;
  const label =
    line.type === "correction"
      ? `correction ${signed(line.amountCents)} (set to ${money(line.setBalanceCents)})`
      : line.type === "contribution"
        ? line.amountCents < 0
          ? `taken back by ${who ?? "?"} ${money(-line.amountCents)}`
          : `contribution ${who ?? "?"} ${money(line.amountCents)}`
        : line.type === "transfer"
          ? `transfer ${line.amountCents < 0 ? "to" : "from"} ${other ?? "?"} ${signed(line.amountCents)}`
          : `${line.type} ${line.label ?? ""} ${signed(line.amountCents)}`.replace(/\s+/g, " ");
  return `${day(line.date)} ${label}${line.note ? ` · ${line.note}` : ""} → ${money(line.balanceAfterCents)}${line.future ? " (planned)" : ""}`;
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────────

/** "Rob → Gezamenlijke rekening: planned € 1.450,00, transferred € 0,00, still € 1.450,00 to transfer (by 01/10/2026)". */
function contributionLines(month: MoneyMonth, names: Map<string, string>) {
  const accountName = (id: string) => month.accounts.find((account) => account.id === id)?.name ?? "?";
  return monthSettlements(month).flatMap((settlement) =>
    settlement.people.map((person) => {
      const head = `${names.get(person.habitantId) ?? "?"} → ${accountName(person.accountId)}: planned ${money(person.plannedCents)}, transferred ${money(person.transferredCents)}`;
      const state =
        person.status === "short"
          ? `still ${money(person.shortCents)} to transfer${person.plannedDate ? ` (planned ${day(person.plannedDate)})` : ""}`
          : person.status === "over"
            ? `${money(person.overCents)} too much (take back or keep as extra)`
            : `done${person.keptExtraCents ? `, ${money(person.keptExtraCents)} extra kept` : ""}`;
      return `${head}; ${state}`;
    }),
  );
}

function nettingLines(month: MoneyMonth, names: Map<string, string>) {
  const accountName = (id: string) => month.accounts.find((account) => account.id === id)?.name ?? "?";
  return monthSettlements(month).flatMap((settlement) =>
    settlement.netting
      ? [
          `Or: ${settlement.netting.direct.map((item) => `${names.get(item.fromHabitantId) ?? "?"} pays ${names.get(item.toHabitantId) ?? "?"} ${money(item.amountCents)} directly`).join(", ")}${settlement.netting.steps.length ? `, then ${settlement.netting.steps.map((step) => `${names.get(step.habitantId) ?? "?"} ${step.kind === "transfer" ? "transfers" : "takes back"} ${money(step.amountCents)}`).join(", ")}` : ""} (${accountName(settlement.accountId)}).`,
        ]
      : [],
  );
}

registerAssistantTool({
  name: "money.overview",
  description:
    "The month on the money flow page: joint and savings balances, money in/out, income received vs expected, contributions per person (planned vs transferred, still to transfer), whether they cover the joint costs, the projected end-of-month balance. For 'heeft iedereen zijn bijdrage gestort' or 'hoeveel staat er op de gezamenlijke rekening'.",
  input: z.object({ month: optionalMonth }),
  permission: "read",
  confirm: "never",
  roles: MONEY_ROLES,
  activity: { en: "Looked at the money flow", nl: "Geldstroom bekeken" },
  run: async (ctx, input) => {
    const [month, names] = await Promise.all([getMoneyMonth(ctx.householdId, input.month ?? currentMonth()), entityNames(ctx, "habitant")]);
    const coverage = monthCoverage(month);
    const projection = coverage.projection;
    const suggestion = coverage.suggestions?.byPlan.map((item) => `${names.get(item.habitantId) ?? "?"} ${money(item.currentCents)} → ${money(item.suggestedCents)}`).join(", ");
    return {
      month: month.month,
      accounts: month.accounts
        .filter((account) => !account.archived)
        .map((account) => {
          const m = month.accountMonths.find((item) => item.accountId === account.id);
          const planned = m && (m.plannedInCents || m.plannedOutCents) ? `, planned in ${money(m.plannedInCents)} out ${money(m.plannedOutCents)}` : "";
          const correction = account.lastCorrection ? `, last correction ${day(account.lastCorrection.date)} set to ${money(account.lastCorrection.balanceCents)}` : "";
          return `${account.name} (${account.kind}${account.isDefault ? ", default" : ""}): ${money(account.balanceCents)} today; month in ${money(m?.inCents ?? 0)}, out ${money(m?.outCents ?? 0)}${planned}${correction}`;
        }),
      income: `received ${money(month.income.household.receivedCents)}, expected ${money(month.income.household.expectedCents)}${month.income.household.toEnterCount ? `, ${month.income.household.toEnterCount} variable amounts to enter` : ""}`,
      contributions: contributionLines(month, names),
      settle: nettingLines(month, names),
      jointCosts: `paid ${money(coverage.paidCents)}, still to pay ${money(coverage.toPayCents)}, planned contributions ${money(coverage.plannedCents)}`,
      coverage:
        coverage.status === "short"
          ? `Short by ${money(-coverage.differenceCents)} this month${suggestion ? ` (to cover: ${suggestion})` : ""}`
          : coverage.status === "left-over"
            ? `Contributions cover the joint costs, ${money(coverage.differenceCents)} left over`
            : "Contributions cover the joint costs",
      projection: projection
        ? `End of month ${money(projection.endCents)} (today ${money(projection.balanceCents)} + still to receive ${money(projection.toReceiveCents)} − to pay ${money(projection.toPayCents)})${projection.belowZeroOn ? `; goes below zero on ${day(projection.belowZeroOn)} (lowest ${money(projection.lowestCents)})` : ""}`
        : null,
    };
  },
});

registerAssistantTool({
  name: "money.history",
  description: "The history of one joint account in a month, newest first: contributions, transfers, paid joint expenses, incomes, corrections (with the balance they set), balance after each line; ids for money_delete_entry.",
  input: z.object({ account: accountArg, month: optionalMonth }),
  permission: "read",
  confirm: "never",
  roles: MONEY_ROLES,
  activity: { en: "Looked at an account's history", nl: "Rekeninghistoriek bekeken" },
  run: async (ctx, input) => {
    const [month, names] = await Promise.all([getMoneyMonth(ctx.householdId, input.month ?? currentMonth()), entityNames(ctx, "habitant")]);
    const account = pickAccount(month.accounts, input.account);
    const lines = month.accountMonths.find((item) => item.accountId === account.id)?.lines ?? [];
    return {
      account: account.name,
      month: month.month,
      balance: money(account.balanceCents),
      ...capList(lines, LIMIT, (line) => ({ id: line.source === "entry" ? line.sourceId : null, line: lineText(line, names, month.accounts) })),
    };
  },
});

registerAssistantTool({
  name: "money.loans",
  description: "Loans and down payments (afbetalingen): what is still open of each, repaid so far, payments to go, last payment, monthly cost.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  roles: MONEY_ROLES,
  activity: { en: "Looked at the loans", nl: "Leningen bekeken" },
  run: async (ctx) => {
    const { loans, totals } = await getMoneyLoans(ctx.householdId);
    return {
      stillOpen: totals.trackedCount ? `${money(totals.remainingCents)} of ${money(totals.totalCents)} (repaid ${money(totals.repaidCents)})` : null,
      perMonth: money(totals.monthlyCents),
      loans: loans.map((loan) => {
        const open = loan.totalOpen;
        const progress = open
          ? `${money(open.remainingCents)} of ${money(open.totalCents)} left, ${open.paymentsLeft} payments to go${open.lastDate ? `, last ${day(open.lastDate)} (${money(open.lastAmountCents)})` : ""}`
          : "no total open recorded";
        return `${loan.payee} (${loan.kind}${loan.status === "paused" ? ", paused" : ""}): ${money(loan.amountCents)}/payment, ${money(loan.monthlyCents)}/month; ${progress}`;
      }),
    };
  },
});

registerAssistantTool({
  name: "money.timeline",
  description: "Income and expenses per month (past actuals, current, projected future incl. loans ending), net per month. For 'how will our expenses evolve' or 'what did we spend per month this year'.",
  input: z.object({
    from: monthSchema("First month YYYY-MM (default 3 months ago)").optional(),
    to: monthSchema("Last month YYYY-MM (default 6 months ahead)").optional(),
  }),
  permission: "read",
  confirm: "never",
  roles: MONEY_ROLES,
  activity: { en: "Looked at the money timeline", nl: "Inkomsten en uitgaven per maand bekeken" },
  run: async (ctx, input) => {
    const now = todayIn();
    const from = input.from ?? monthOf(addMonthsClamped(now, -3));
    const to = input.to ?? monthOf(addMonthsClamped(now, 6));
    if (to < from) throw badRequest("to must be after from");
    if (monthsApart(from, to) >= 36) throw badRequest("At most 36 months at once");
    const timeline = await getMoneyTimeline(ctx.householdId, from, to);
    return capList(timeline.months, 24, (item) =>
      [
        `${item.month}${item.period === "past" ? "" : ` (${item.period === "current" ? "current" : "projected"})`}:`,
        `in ${money(item.incomeCents)}${item.incomeEstimateCents ? ` (est. ${money(item.incomeEstimateCents)})` : ""},`,
        `out ${money(item.expenseCents)} (loans ${money(item.loansCents)}, recurring ${money(item.recurringCents)}, one-off ${money(item.oneOffCents)}),`,
        `net ${money(item.netCents)}`,
      ].join(" "),
    );
  },
});

// ── Transfers and corrections ───────────────────────────────────────────────────────────────────────

const transferInput = z.object({
  from: entityRef("habitant", "Person who transferred (a contribution)").optional(),
  fromAccount: entityRef("account", "Or: the joint account the money came from (e.g. savings)").optional(),
  to: accountArg,
  amount: eurosSchema.optional().describe("Default: what that person still has to transfer this month"),
  date: optionalDateSchema("Day of the transfer YYYY-MM-DD (default today)"),
  note: z.string().trim().max(300).optional(),
});
type TransferInput = z.output<typeof transferInput>;

async function transferPlan(ctx: AssistantToolContext, input: TransferInput) {
  if (!input.from === !input.fromAccount) throw badRequest("Say who transferred (from) or which account it came from (fromAccount)");
  const date = input.date ?? todayIn();
  const month = await getMoneyMonth(ctx.householdId, monthOf(date));
  const to = pickAccount(month.accounts, input.to);
  const fromAccount = input.fromAccount ? pickAccount(month.accounts, input.fromAccount) : null;
  if (fromAccount?.id === to.id) throw badRequest("From and to are the same account");
  let amountCents = input.amount ? toCents(input.amount) : 0;
  if (!amountCents && input.from) {
    amountCents = month.contributions.find((row) => row.habitantId === input.from?.id && row.accountId === to.id)?.remainingCents ?? 0;
    if (!amountCents) throw badRequest(`${input.from.name} has nothing left to transfer to ${to.name} this month: say the amount`);
  }
  if (!amountCents) throw badRequest("Say the amount");
  const correction = to.lastCorrection;
  const warning =
    correction && date < correction.date
      ? "Dated before the last correction: counts for the plan, not the balance (already included)."
      : correction && date === correction.date
        ? "On the day of the last correction: added on top of it."
        : null;
  return { date, to, fromAccount, amountCents, warning };
}

registerAssistantTool({
  name: "money.record_transfer",
  description:
    "Record money moved into a joint account: a person's contribution (from) or a transfer between joint accounts, e.g. savings → joint (fromAccount). Without amount: what the person still has to transfer this month.",
  input: transferInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Recorded a transfer", nl: "Overschrijving genoteerd" },
  describe: async (ctx, input) => {
    const plan = await transferPlan(ctx, input);
    const from = input.from?.name ?? plan.fromAccount?.name ?? "";
    return say(ctx.locale, `Record ${money(plan.amountCents)} from ${from} to ${plan.to.name} on ${day(plan.date, "en")}`, `${money(plan.amountCents)} van ${from} naar ${plan.to.name} noteren op ${day(plan.date, "nl")}`);
  },
  preview: async (ctx, input) => {
    const plan = await transferPlan(ctx, input);
    return fieldsPreview(ctx.locale, input.from ? ["Contribution", "Bijdrage"] : ["Transfer", "Overschrijving"], [
      [["Amount", "Bedrag"], money(plan.amountCents)],
      [["From", "Van"], input.from?.name ?? plan.fromAccount?.name],
      [["To", "Naar"], plan.to.name],
      [["Date", "Datum"], day(plan.date, ctx.locale)],
      [["Note", "Notitie"], input.note],
      [["Note", "Let op"], plan.warning],
    ]);
  },
  run: async (ctx, input) => {
    const plan = await transferPlan(ctx, input);
    await recordTransfer(ctx.householdId, ctx.user.id, {
      from: input.from ? `habitant:${input.from.id}` : `account:${plan.fromAccount?.id ?? ""}`,
      toAccountId: plan.to.id,
      date: plan.date,
      amountCents: plan.amountCents,
      note: input.note ?? null,
    });
    return done(`Recorded ${money(plan.amountCents)} from ${input.from?.name ?? plan.fromAccount?.name} to ${plan.to.name} on ${day(plan.date)}.${plan.warning ? ` ${plan.warning}` : ""}`);
  },
});

const balanceInput = z.object({
  account: accountArg,
  balance: z.number().min(-10_000_000).max(10_000_000).describe("The real balance in euros (negative when overdrawn)"),
  date: optionalDateSchema("Day of that balance YYYY-MM-DD (default today)"),
  note: z.string().trim().max(300).optional(),
});

async function balancePlan(ctx: AssistantToolContext, input: z.output<typeof balanceInput>) {
  const date = input.date ?? todayIn();
  if (date > todayIn()) throw badRequest("A real balance can't be in the future");
  const month = await getMoneyMonth(ctx.householdId, monthOf(date));
  const account = pickAccount(month.accounts, input.account);
  const appCents = date === todayIn() ? account.balanceCents : balanceOn(month.accountMonths.find((item) => item.accountId === account.id), date);
  const newCents = toCents(input.balance);
  return { date, account, appCents, newCents, differenceCents: appCents === null ? null : newCents - appCents };
}

registerAssistantTool({
  name: "money.set_balance",
  description: "Set the real balance of a joint account (as the bank shows it). The app records a correction for the difference; nothing else changes.",
  input: balanceInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Set an account balance", nl: "Saldo ingesteld" },
  auditedByService: true,
  describe: async (ctx, input) => {
    const plan = await balancePlan(ctx, input);
    return say(ctx.locale, `Set ${plan.account.name} to ${money(plan.newCents)} on ${day(plan.date, "en")}`, `${plan.account.name} op ${money(plan.newCents)} zetten op ${day(plan.date, "nl")}`);
  },
  preview: async (ctx, input) => {
    const plan = await balancePlan(ctx, input);
    return fieldsPreview(ctx.locale, ["Balance correction", "Saldocorrectie"], [
      [["Account", "Rekening"], plan.account.name],
      [["Date", "Datum"], day(plan.date, ctx.locale)],
      [["In the app", "In de app"], money(plan.appCents)],
      [["Real balance", "Echt saldo"], money(plan.newCents)],
      [["Correction", "Correctie"], plan.differenceCents === null ? null : signed(plan.differenceCents)],
    ]);
  },
  run: async (ctx, input) => {
    const plan = await balancePlan(ctx, input);
    const actor = { householdId: ctx.householdId, userId: ctx.user.id, name: ctx.user.name, channel: ctx.channel === "mcp" ? ("mcp" as const) : ("assistant" as const) };
    await setBalance(ctx.householdId, ctx.user.id, plan.account.id, { date: plan.date, balanceCents: Math.abs(plan.newCents), negative: plan.newCents < 0, note: input.note ?? null }, actor);
    return done(`Set ${plan.account.name} to ${money(plan.newCents)} on ${day(plan.date)}${plan.differenceCents ? ` (correction ${signed(plan.differenceCents)})` : ""}.`);
  },
});

const entryInput = z.object({
  account: accountArg,
  direction: z.enum(["in", "out"]).describe("in: interest, a refund…; out: a withdrawal, bank costs…"),
  amount: eurosSchema,
  date: optionalDateSchema("YYYY-MM-DD (default today)"),
  note: z.string().trim().max(300).optional().describe("What it was, e.g. 'rente'"),
});

registerAssistantTool({
  name: "money.add_entry",
  description: "Record other money in or out of a joint account that is no bill, income or contribution: interest, bank costs, a cash withdrawal.",
  input: entryInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Recorded money in or out", nl: "In- of uitgaand bedrag genoteerd" },
  describe: (ctx, input) => {
    const amount = money(toCents(input.amount));
    const account = input.account?.name ?? say(ctx.locale, "the joint account", "de gezamenlijke rekening");
    return input.direction === "in" ? say(ctx.locale, `Record ${amount} in on ${account}`, `${amount} inkomend noteren op ${account}`) : say(ctx.locale, `Record ${amount} out of ${account}`, `${amount} uitgaand noteren van ${account}`);
  },
  preview: async (ctx, input) => {
    const account = pickAccount(await accountsOf(ctx), input.account);
    return fieldsPreview(ctx.locale, input.direction === "in" ? ["Money in", "Inkomend"] : ["Money out", "Uitgaand"], [
      [["Amount", "Bedrag"], signed(input.direction === "in" ? toCents(input.amount) : -toCents(input.amount))],
      [["Account", "Rekening"], account.name],
      [["Date", "Datum"], day(input.date ?? todayIn(), ctx.locale)],
      [["Note", "Notitie"], input.note],
    ]);
  },
  run: async (ctx, input) => {
    const account = pickAccount(await accountsOf(ctx), input.account);
    const date = input.date ?? todayIn();
    await addOtherEntry(ctx.householdId, ctx.user.id, account.id, { direction: input.direction, date, amountCents: toCents(input.amount), note: input.note ?? null });
    return done(`Recorded ${signed(input.direction === "in" ? toCents(input.amount) : -toCents(input.amount))} on ${account.name} (${day(date)}).`);
  },
});

registerAssistantTool({
  name: "money.delete_entry",
  description: "Delete a ledger line by its id from money_history: a contribution, take-back, transfer (both sides), other entry or a later correction. Paid expenses and incomes are changed in their own skill.",
  input: z.object({ id: z.string().trim().min(1).max(64).describe("Line id from money_history") }),
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Deleted an account entry", nl: "Rekeninglijn verwijderd" },
  describe: (ctx) => say(ctx.locale, "Delete this account entry", "Deze rekeninglijn verwijderen"),
  preview: async (ctx, input) => {
    const entry = await db.accountEntry.findFirst({ where: { id: input.id, householdId: ctx.householdId }, include: { account: { select: { name: true } } } });
    if (!entry) throw badRequest("No account entry with that id; take it from money_history");
    const date = entry.date.toISOString().slice(0, 10);
    const what = entry.type === "CORRECTION" ? `correction (set to ${money(entry.balanceCents)})` : entry.type.toLowerCase();
    return {
      kind: "list",
      title: say(ctx.locale, entry.transferId ? "Deleted (with its other side)" : "Deleted", entry.transferId ? "Verwijderd (met de tegenboeking)" : "Verwijderd"),
      data: { items: [{ label: `${entry.account.name}: ${what}`, detail: `${signed(entry.amountCents)} · ${day(date, ctx.locale)}`, tone: "remove" }] },
    };
  },
  run: async (ctx, input) => {
    await deleteEntry(ctx.householdId, input.id);
    return done("Deleted the account entry.");
  },
});

// ── Settling contributions ──────────────────────────────────────────────────────────────────────────

const settleInput = z.object({
  action: z.enum(["take_back", "keep_extra", "direct_payment"]).describe("take_back: someone takes an over-contribution back; keep_extra: leave it as extra; direct_payment: one person paid the other directly"),
  person: entityRef("habitant", "Who takes back / keeps extra / paid directly"),
  toPerson: entityRef("habitant", "direct_payment: who received it").optional(),
  account: accountArg,
  amount: z.number().min(0).max(10_000_000).optional().describe("Euros; default what the month's settlement says (keep_extra 0 = flag it again)"),
  month: optionalMonth,
});
type SettleInput = z.output<typeof settleInput>;

async function settlePlan(ctx: AssistantToolContext, input: SettleInput) {
  const month = await getMoneyMonth(ctx.householdId, input.month ?? currentMonth());
  const account = pickAccount(month.accounts, input.account);
  const settlement = monthSettlements(month).find((item) => item.accountId === account.id);
  const person = settlement?.people.find((item) => item.habitantId === input.person.id);
  // A past month is settled on its last day.
  const date = month.month < currentMonth() ? monthBounds(month.month).to : todayIn();
  let amountCents = input.amount === undefined ? null : toCents(input.amount);
  if (input.action === "direct_payment") {
    if (!input.toPerson) throw badRequest("direct_payment needs toPerson");
    amountCents ??= settlement?.netting?.direct.find((item) => item.fromHabitantId === input.person.id && item.toHabitantId === input.toPerson?.id)?.amountCents ?? null;
  } else if (input.action === "take_back") {
    amountCents ??= person?.overCents ?? null;
  } else {
    amountCents ??= person && person.differenceCents > 0 ? person.differenceCents : null;
  }
  if (amountCents === null || (amountCents === 0 && input.action !== "keep_extra")) throw badRequest("Nothing to settle for that person this month: say the amount");
  return { month: month.month, account, date, amountCents };
}

registerAssistantTool({
  name: "money.settle",
  description: "Settle the month's contributions: take back an over-contribution, keep it as extra, or record that one person paid the other directly (netting). Amounts default to what money_overview suggests.",
  input: settleInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Settled contributions", nl: "Bijdragen verrekend" },
  describe: async (ctx, input) => {
    const plan = await settlePlan(ctx, input);
    const amount = money(plan.amountCents);
    if (input.action === "take_back") return say(ctx.locale, `${input.person.name} takes ${amount} back from ${plan.account.name}`, `${input.person.name} neemt ${amount} terug van ${plan.account.name}`);
    if (input.action === "keep_extra") return say(ctx.locale, `Keep ${amount} of ${input.person.name}'s surplus as extra (${plan.month})`, `${amount} van het overschot van ${input.person.name} houden als extra (${plan.month})`);
    return say(ctx.locale, `${input.person.name} paid ${input.toPerson?.name} ${amount} directly`, `${input.person.name} betaalde ${input.toPerson?.name} rechtstreeks ${amount}`);
  },
  preview: async (ctx, input) => {
    const plan = await settlePlan(ctx, input);
    const titles: Record<SettleInput["action"], [string, string]> = { take_back: ["Take back", "Terugnemen"], keep_extra: ["Keep as extra", "Houden als extra"], direct_payment: ["Direct payment", "Rechtstreekse betaling"] };
    return fieldsPreview(ctx.locale, titles[input.action], [
      [["Amount", "Bedrag"], money(plan.amountCents)],
      [["Person", "Persoon"], input.toPerson ? `${input.person.name} → ${input.toPerson.name}` : input.person.name],
      [["Account", "Rekening"], plan.account.name],
      [[input.action === "keep_extra" ? "Month" : "Date", input.action === "keep_extra" ? "Maand" : "Datum"], input.action === "keep_extra" ? plan.month : day(plan.date, ctx.locale)],
    ]);
  },
  run: async (ctx, input) => {
    const plan = await settlePlan(ctx, input);
    if (input.action === "take_back") {
      await takeBackContribution(ctx.householdId, ctx.user.id, { habitantId: input.person.id, accountId: plan.account.id, date: plan.date, amountCents: plan.amountCents, note: null });
      return done(`${input.person.name} took ${money(plan.amountCents)} back from ${plan.account.name} (${day(plan.date)}).`);
    }
    if (input.action === "keep_extra") {
      await setKeptExtra(ctx.householdId, ctx.user.id, { habitantId: input.person.id, accountId: plan.account.id, month: plan.month, amountCents: plan.amountCents });
      return done(plan.amountCents ? `Kept ${money(plan.amountCents)} of ${input.person.name}'s surplus as extra.` : `${input.person.name}'s surplus is flagged again.`);
    }
    await recordDirectPayment(ctx.householdId, ctx.user.id, { fromHabitantId: input.person.id, toHabitantId: input.toPerson?.id ?? "", accountId: plan.account.id, date: plan.date, amountCents: plan.amountCents });
    return done(`Recorded that ${input.person.name} paid ${input.toPerson?.name} ${money(plan.amountCents)} directly.`);
  },
});

// ── Contribution plans ──────────────────────────────────────────────────────────────────────────────

const planInput = z.object({
  person: entityRef("habitant"),
  account: accountArg,
  amount: eurosSchema.optional().describe("New monthly contribution in euros"),
  dayOfMonth: z.number().int().min(1).max(31).optional().describe("Day of the month it is transferred"),
  from: monthSchema("From month YYYY-MM (default this month); earlier months keep their plan").optional(),
  stop: z.boolean().optional().describe("Stop the plan from that month"),
});
type PlanInput = z.output<typeof planInput>;

async function contributionPlan(ctx: AssistantToolContext, input: PlanInput) {
  const fromMonth = input.from ?? currentMonth();
  const activeFrom = `${fromMonth}-01`;
  const month = await getMoneyMonth(ctx.householdId, fromMonth);
  const account = pickAccount(month.accounts, input.account);
  const plans = month.plans.filter((plan) => plan.habitantId === input.person.id && plan.accountId === account.id);
  const current = plans.find((plan) => planActiveIn(plan, fromMonth)) ?? null;
  if (input.stop && !current) throw badRequest(`${input.person.name} has no plan for ${account.name} in ${fromMonth}`);
  if (!input.stop && !input.amount && !current) throw badRequest("Say the monthly amount");
  if (!input.stop && !input.amount && input.dayOfMonth === undefined) throw badRequest("Say the new amount or day");
  return { account, current, activeFrom, fromMonth };
}

registerAssistantTool({
  name: "money.plan",
  description: "Set or change a person's fixed monthly contribution to a joint account (from a month on; earlier months keep the old plan), or stop it.",
  input: planInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Changed a contribution plan", nl: "Bijdrageplan gewijzigd" },
  describe: async (ctx, input) => {
    const { account, fromMonth } = await contributionPlan(ctx, input);
    return input.stop
      ? say(ctx.locale, `Stop ${input.person.name}'s contribution to ${account.name} from ${fromMonth}`, `Bijdrage van ${input.person.name} aan ${account.name} stoppen vanaf ${fromMonth}`)
      : say(ctx.locale, `${input.person.name} contributes ${money(toCents(input.amount ?? 0)) ?? ""} a month to ${account.name} from ${fromMonth}`, `${input.person.name} draagt vanaf ${fromMonth} ${money(toCents(input.amount ?? 0)) ?? ""} per maand bij aan ${account.name}`);
  },
  preview: async (ctx, input) => {
    const { account, current, activeFrom } = await contributionPlan(ctx, input);
    const amount = input.amount ? toCents(input.amount) : (current?.amountCents ?? 0);
    return fieldsPreview(ctx.locale, ["Contribution plan", "Bijdrageplan"], [
      [["Person", "Persoon"], input.person.name],
      [["Account", "Rekening"], account.name],
      [["Per month", "Per maand"], input.stop ? `${money(current?.amountCents)} → ${say(ctx.locale, "stopped", "gestopt")}` : current && current.amountCents !== amount ? `${money(current.amountCents)} → ${money(amount)}` : money(amount)],
      [["Day", "Dag"], input.dayOfMonth ? String(input.dayOfMonth) : current ? null : "1"],
      [["From", "Vanaf"], day(activeFrom, ctx.locale)],
    ]);
  },
  run: async (ctx, input) => {
    const { account, current, activeFrom } = await contributionPlan(ctx, input);
    if (input.stop && current) {
      // A plan that would end before it starts never applied: remove it, like deleting it on the page.
      if (current.activeFrom >= activeFrom) await deletePlan(ctx.householdId, current.id);
      else await updatePlan(ctx.householdId, current.id, contributionPlanSchema.parse({ ...current, activeTo: addDays(activeFrom, -1) }));
      return done(`Stopped ${input.person.name}'s contribution to ${account.name} from ${day(activeFrom)}.`);
    }
    if (!current) {
      const plan = await createPlan(ctx.householdId, contributionPlanSchema.parse({ habitantId: input.person.id, accountId: account.id, amountCents: toCents(input.amount ?? 0), dayOfMonth: input.dayOfMonth ?? 1, activeFrom }));
      return done(`${input.person.name} contributes ${money(plan.amountCents)} a month to ${account.name} from ${day(plan.activeFrom)}.`, { id: plan.id });
    }
    const amountCents = input.amount ? toCents(input.amount) : current.amountCents;
    // Only a new amount starts from the chosen month (the service ends the old plan the day before).
    const start = amountCents !== current.amountCents && current.activeFrom < activeFrom ? activeFrom : current.activeFrom;
    const plan = await updatePlan(ctx.householdId, current.id, contributionPlanSchema.parse({ ...current, amountCents, dayOfMonth: input.dayOfMonth ?? current.dayOfMonth, activeFrom: start }));
    return done(`${input.person.name} contributes ${money(plan.amountCents)} a month to ${account.name} from ${day(plan.activeFrom)} (day ${plan.dayOfMonth}).`, { id: plan.id });
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): the money flow ──

registerScreenContext({
  kind: "money",
  skills: ["money"],
  describe: (ctx) => ({ label: say(ctx.locale, "Money flow", "Geldstroom"), summary: "the money flow (joint accounts, contributions, this month's balance)" }),
});
