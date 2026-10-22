import { z } from "zod";
import {
  INCOME_KINDS,
  JOINT,
  SOURCE_KINDS,
  incomeInputSchema,
  incomeSourceCreateSchema,
  incomeSourceUpdateSchema,
  type Income,
  type IncomeSource,
} from "@/features/income/types/income";
import { monthOf, todayIn } from "@/types/dates";
import { createIncome, createIncomeSource, deleteIncome, getIncomeMonth, getIncomeOverview, updateIncomeSource } from "@/api/income/income.service";
import { badRequest } from "@/api/lib/http";
import {
  capList,
  dateSchema,
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
  registerEntityResolver,
  registerScreenContext,
  say,
  toCents,
  type AssistantToolContext,
  type ResolvedEntity,
} from "@ai/core/kit";
import { MONEY_ROLES, fieldsPreview, rhythm, rruleFor } from "../expenses/shared";

/**
 * Skill "income": salaries, meal vouchers, one-off incomes (guide: guide.md next to this file). Children
 * don't get this skill: what people earn stays with the adults in the assistant. Received vs expected is the
 * income service's rule (dated after today = still expected); the tools never decide it themselves.
 */

registerAssistantSkill({
  id: "income",
  title: { en: "Income", nl: "Inkomsten" },
  summary: "Incomes per person or joint (salary, meal vouchers, tax return, green certificates): received vs expected, record, recurring incomes.",
  keywords: {
    nl: ["inkomen", "inkomsten", "loon", "salaris", "maaltijdcheque", "maaltijdcheques", "ecocheque", "vakantiegeld", "eindejaarspremie", "premie", "uitkering", "kindergeld", "groeipakket", "belastingteruggave", "belastingen terug", "terugbetaling", "groenestroomcertificaten", "groene stroom", "certificaten", "loonsverhoging", "verdien"],
    en: ["income", "salary", "wage", "meal voucher", "holiday pay", "bonus", "benefit", "child benefit", "tax return", "tax refund", "green certificates", "raise", "earn"],
  },
  roles: MONEY_ROLES,
});

const KIND_WORDS: Record<string, string[]> = {
  salary: ["loon", "salaris", "salary"],
  holiday_pay: ["vakantiegeld", "holiday pay"],
  bonus: ["premie", "eindejaarspremie", "bonus"],
  meal_vouchers: ["maaltijdcheques", "meal vouchers"],
  benefit: ["uitkering", "kindergeld", "benefit"],
};

registerEntityResolver({
  type: "income_source",
  label: "recurring income",
  skill: "income",
  roles: MONEY_ROLES,
  list: async (ctx) => {
    const [{ sources }, names] = await Promise.all([getIncomeOverview(ctx.householdId, monthOf(todayIn())), entityNames(ctx, "habitant")]);
    return sources.map((source) => {
      const who = source.habitantId ? (names.get(source.habitantId) ?? "") : "joint";
      return {
        id: source.id,
        name: source.name,
        aliases: (KIND_WORDS[source.kind] ?? []).flatMap((word) => [`${word} ${who}`, `${who} ${word}`]),
        hint: `${who}, ${source.kind}${source.active ? "" : ", ended"}`,
      };
    });
  },
});

const optionalMonth = monthSchema("Month YYYY-MM (default this month)").optional();
const whoOf = (names: Map<string, string>, habitantId: string | null) => (habitantId ? (names.get(habitantId) ?? "?") : "joint");
const isExpected = (income: Pick<Income, "date">) => income.date > todayIn();

registerAssistantTool({
  name: "income.to_enter",
  description: "Variable recurring incomes (e.g. meal vouchers) whose actual amount still has to be entered for a month, with source, person and estimate.",
  input: z.object({ month: optionalMonth }),
  permission: "read",
  confirm: "never",
  roles: MONEY_ROLES,
  activity: { en: "Checked incomes to enter", nl: "In te vullen inkomsten bekeken" },
  run: async (ctx, input) => {
    const month = input.month ?? monthOf(todayIn());
    const [{ occurrences }, names] = await Promise.all([getIncomeMonth(ctx.householdId, month), entityNames(ctx, "habitant")]);
    return {
      month,
      toEnter: occurrences
        .filter((occurrence) => occurrence.status === "to_enter")
        .map((occurrence) => ({
          name: occurrence.name,
          kind: occurrence.kind,
          person: whoOf(names, occurrence.habitantId),
          periodDate: occurrence.date,
          estimate: money(occurrence.plannedCents),
        })),
    };
  },
});

function sourceSummary(source: IncomeSource, names: Map<string, string>) {
  return {
    name: source.name,
    person: whoOf(names, source.habitantId),
    kind: source.kind,
    amount: source.amountMode === "variable" ? `variable${source.estimateCents ? `, estimate ${money(source.estimateCents)}` : ""}` : `${money(source.currentAmountCents)}${source.currentAmountFrom ? ` since ${day(source.currentAmountFrom)}` : ""}`,
    rhythm: rhythm(source.rrule),
    next: source.nextDate,
    perMonth: money(source.monthlyCents),
    ended: source.active ? null : source.endDate,
    endDate: source.active ? source.endDate : null,
  };
}

registerAssistantTool({
  name: "income.list",
  description:
    "Income of a month per person (received vs still expected, occurrences, meal voucher balances), the recurring incomes (sources), or the recorded history with ids. For 'what came in this month', 'what does Rob earn', 'is the tax return in yet'.",
  input: z.object({
    view: z.enum(["month", "sources", "history"]).default("month"),
    month: optionalMonth,
    person: entityRef("habitant").optional(),
  }),
  permission: "read",
  confirm: "never",
  roles: MONEY_ROLES,
  activity: { en: "Looked at the income", nl: "Inkomsten bekeken" },
  run: async (ctx, input) => {
    const month = input.month ?? monthOf(todayIn());
    const [overview, names] = await Promise.all([getIncomeOverview(ctx.householdId, month), entityNames(ctx, "habitant")]);
    const mine = (habitantId: string | null) => !input.person || habitantId === input.person.id;
    if (input.view === "sources") {
      return capList(overview.sources.filter((source) => mine(source.habitantId)), 25, (source) => sourceSummary(source, names));
    }
    if (input.view === "history") {
      return capList(overview.incomes.filter((income) => mine(income.habitantId)), 25, (income) => ({
        id: income.id,
        date: income.date,
        amount: money(income.amountCents),
        kind: income.kind,
        person: whoOf(names, income.habitantId),
        what: income.description ?? overview.sources.find((source) => source.id === income.sourceId)?.name,
        expected: isExpected(income) || null,
      }));
    }
    const { totals } = overview;
    return {
      month,
      household: `received ${money(totals.household.receivedCents)}, expected ${money(totals.household.expectedCents)}, total ${money(totals.household.totalCents)} (meal vouchers apart)`,
      people: totals.people
        .filter((row) => !input.person || row.key === input.person.id)
        .map((row) => `${row.key === JOINT ? "joint" : (names.get(row.key) ?? "?")}: received ${money(row.receivedCents)}, expected ${money(row.expectedCents)}`),
      occurrences: overview.occurrences
        .filter((occurrence) => mine(occurrence.habitantId))
        .map((occurrence) => `${occurrence.name} (${whoOf(names, occurrence.habitantId)}) ${day(occurrence.date)}: ${money(occurrence.income?.amountCents ?? occurrence.plannedCents) ?? "?"} ${occurrence.status.replace("_", " ")}`),
      oneOffs: overview.incomes
        .filter((income) => !income.sourceId && income.date.startsWith(month) && mine(income.habitantId))
        .map((income) => `${income.description ?? income.kind} (${whoOf(names, income.habitantId)}) ${money(income.amountCents)} ${day(income.date)}${isExpected(income) ? " expected" : ""}`),
      mealVouchers: overview.vouchers
        .filter((voucher) => mine(voucher.habitantId))
        .map((voucher) => `${names.get(voucher.habitantId) ?? "?"}: ${money(voucher.availableCents)} available${voucher.nextExpiry ? `, ${money(voucher.nextExpiry.amountCents)} expires ${day(voucher.nextExpiry.date)}` : ""}${voucher.uncoveredCents ? `, ${money(voucher.uncoveredCents)} uncovered` : ""}`),
    };
  },
});

// ── Recording ───────────────────────────────────────────────────────────────────────────────────────

/** The month's occurrence to fill in: by kind and person, preferring ones still to enter. */
async function findOccurrence(ctx: AssistantToolContext, input: { kind: string; person?: ResolvedEntity; month?: string }) {
  const month = input.month ?? monthOf(todayIn());
  const { occurrences } = await getIncomeMonth(ctx.householdId, month);
  let candidates = occurrences.filter((occurrence) => occurrence.amountMode === "variable" && occurrence.kind === input.kind);
  const habitantId = input.person?.id ?? ctx.user.habitantId;
  const own = candidates.filter((occurrence) => occurrence.habitantId === habitantId);
  if (own.length) candidates = own;
  const open = candidates.filter((occurrence) => occurrence.status === "to_enter");
  const target = (open.length ? open : candidates)[0];
  if (!target) throw badRequest(`No variable ${input.kind} income planned in ${month}; add it with income_add_source first`);
  // Received or entered ahead with a later date ("upcoming"): either way it is recorded already.
  if (target.income) throw badRequest(`“${target.name}” was already entered for ${month}`);
  return target;
}

registerAssistantTool({
  name: "income.record_variable",
  description: "Enter the actual amount of a variable recurring income for one month, e.g. 'my meal vouchers this month were 160 euro'. Finds the income by kind and person.",
  input: z.object({
    amount: eurosSchema,
    kind: z.enum(["meal_vouchers", "salary", "bonus", "benefit", "holiday_pay", "other"]).default("meal_vouchers"),
    person: entityRef("habitant", "Whose income (first name); default the person asking").optional(),
    month: optionalMonth,
  }),
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Recorded an income", nl: "Inkomen ingevuld" },
  describe: async (ctx, input) => {
    const target = await findOccurrence(ctx, input);
    const amount = money(toCents(input.amount));
    return say(ctx.locale, `Enter ${amount} for “${target.name}” (${day(target.date, "en")})`, `${amount} invullen voor “${target.name}” (${day(target.date, "nl")})`);
  },
  preview: async (ctx, input) => {
    const target = await findOccurrence(ctx, input);
    const names = await entityNames(ctx, "habitant");
    return fieldsPreview(ctx.locale, ["Income", "Inkomen"], [
      [["Amount", "Bedrag"], money(toCents(input.amount))],
      [["Income", "Inkomen"], target.name],
      [["Person", "Persoon"], whoOf(names, target.habitantId)],
      [["Period", "Periode"], day(target.date, ctx.locale)],
    ]);
  },
  run: async (ctx, input) => {
    const target = await findOccurrence(ctx, input);
    const income = await createIncome(
      ctx.householdId,
      incomeInputSchema.parse({
        habitantId: target.habitantId ?? JOINT,
        date: todayIn() < target.date ? target.date : todayIn(),
        amountCents: toCents(input.amount),
        kind: target.kind,
        sourceId: target.sourceId,
        periodDate: target.date,
        targetAccountId: target.targetAccountId,
      }),
    );
    return done(`Entered ${money(income.amountCents)} for “${target.name}” (${day(target.date)}).`, { id: income.id });
  },
});

const recordInput = z.object({
  amount: eurosSchema.optional().describe("Euros; for a recurring income default its planned amount"),
  kind: z.enum(INCOME_KINDS).optional().describe("One-off: tax_return (belastingteruggave), green_certificates, gift, sale, bonus…"),
  source: entityRef("income_source", "A fixed recurring income that came in (e.g. 'loon Rob')").optional(),
  month: optionalMonth.describe("source: which month's payment (default this month)"),
  person: entityRef("habitant", "Whose income; default the person asking").optional(),
  joint: z.boolean().optional().describe("A joint income (e.g. a joint tax return)"),
  date: optionalDateSchema("Day it came in, YYYY-MM-DD (default today; a later date means still expected)"),
  description: z.string().trim().max(120).optional(),
  account: entityRef("account", "Joint account it lands on, if any").optional(),
});
type RecordInput = z.output<typeof recordInput>;

/** The income to create: an occurrence of a source (who and kind from it), or a one-off. */
async function recordData(ctx: AssistantToolContext, input: RecordInput) {
  const date = input.date ?? todayIn();
  if (input.source) {
    const month = input.month ?? monthOf(todayIn());
    const { occurrences } = await getIncomeMonth(ctx.householdId, month);
    const occurrence = occurrences.find((item) => item.sourceId === input.source?.id && !item.income) ?? occurrences.find((item) => item.sourceId === input.source?.id);
    if (!occurrence) throw badRequest(`${input.source.name} has no payment in ${month}`);
    if (occurrence.income) throw badRequest(`${input.source.name} was already recorded for ${month} (${money(occurrence.income.amountCents)} on ${day(occurrence.income.date)})`);
    const amountCents = input.amount ? toCents(input.amount) : occurrence.plannedCents;
    if (!amountCents) throw badRequest(`Say the amount of ${input.source.name}`);
    return {
      label: occurrence.name,
      income: incomeInputSchema.parse({
        habitantId: occurrence.habitantId ?? JOINT,
        date,
        amountCents,
        kind: occurrence.kind,
        sourceId: occurrence.sourceId,
        periodDate: occurrence.date,
        targetAccountId: input.account?.id ?? occurrence.targetAccountId,
        description: input.description ?? null,
      }),
    };
  }
  if (!input.amount || !input.kind) throw badRequest("A one-off income needs amount and kind; for a recurring one pass source");
  if (!input.joint && !input.person && !ctx.user.habitantId) throw badRequest("Say whose income it is, or joint");
  return {
    label: input.description ?? input.kind,
    income: incomeInputSchema.parse({
      habitantId: input.joint ? JOINT : (input.person?.id ?? ctx.user.habitantId),
      date,
      amountCents: toCents(input.amount),
      kind: input.kind,
      description: input.description ?? null,
      targetAccountId: input.account?.id ?? null,
    }),
  };
}

registerAssistantTool({
  name: "income.record",
  description:
    "Record an income: a one-off (tax return, green certificates, gift, sale) for a person or joint, or a fixed recurring income that came in (source). A date after today records it as expected. Variable amounts (meal vouchers): income_record_variable.",
  input: recordInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Recorded an income", nl: "Inkomen genoteerd" },
  describe: async (ctx, input) => {
    const { label, income } = await recordData(ctx, input);
    const when = day(income.date, ctx.locale);
    return income.date > todayIn()
      ? say(ctx.locale, `Record ${money(income.amountCents)} ${label} as expected on ${when}`, `${money(income.amountCents)} ${label} noteren als verwacht op ${when}`)
      : say(ctx.locale, `Record ${money(income.amountCents)} ${label} received on ${when}`, `${money(income.amountCents)} ${label} noteren als ontvangen op ${when}`);
  },
  preview: async (ctx, input) => {
    const { label, income } = await recordData(ctx, input);
    const names = await entityNames(ctx, "habitant");
    return fieldsPreview(ctx.locale, ["Income", "Inkomen"], [
      [["Amount", "Bedrag"], money(income.amountCents)],
      [["What", "Wat"], label],
      [["Person", "Persoon"], whoOf(names, income.habitantId)],
      [["Date", "Datum"], `${day(income.date, ctx.locale)} · ${income.date > todayIn() ? say(ctx.locale, "expected", "verwacht") : say(ctx.locale, "received", "ontvangen")}`],
      [["Account", "Rekening"], input.account?.name],
    ]);
  },
  run: async (ctx, input) => {
    const { label, income: data } = await recordData(ctx, input);
    const income = await createIncome(ctx.householdId, data);
    return done(`Recorded ${money(income.amountCents)} ${label} on ${day(income.date)}${isExpected(income) ? " (expected)" : ""}.`, { id: income.id });
  },
});

// ── Recurring incomes ───────────────────────────────────────────────────────────────────────────────

const RECURRING_REPEATS = ["monthly", "weekly", "yearly"] as const;

const addSourceInput = z.object({
  name: z.string().trim().min(1).max(80).describe("e.g. 'Loon Rob', 'Maaltijdcheques Clara'"),
  kind: z.enum(SOURCE_KINDS),
  person: entityRef("habitant", "Whose income; default the person asking").optional(),
  joint: z.boolean().optional(),
  repeat: z.enum(RECURRING_REPEATS).default("monthly"),
  startDate: dateSchema("First payment YYYY-MM-DD"),
  amount: eurosSchema.optional().describe("Fixed amount; leave out for a variable income"),
  estimate: eurosSchema.optional().describe("Variable income: what to expect"),
  endDate: optionalDateSchema("Last payment, if it ends"),
  account: entityRef("account", "Joint account it lands on, if any").optional(),
});

function sourceCreateOf(ctx: AssistantToolContext, input: z.output<typeof addSourceInput>) {
  if (!input.joint && !input.person && !ctx.user.habitantId) throw badRequest("Say whose income it is, or joint");
  return incomeSourceCreateSchema.parse({
    habitantId: input.joint ? JOINT : (input.person?.id ?? ctx.user.habitantId),
    name: input.name,
    kind: input.kind,
    rrule: rruleFor(input.repeat),
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    amountMode: input.amount ? "fixed" : "variable",
    amountCents: input.amount ? toCents(input.amount) : null,
    estimateCents: input.estimate ? toCents(input.estimate) : null,
    targetAccountId: input.account?.id ?? null,
  });
}

registerAssistantTool({
  name: "income.add_source",
  description: "Add a recurring income (salary, holiday pay, meal vouchers, benefit) for a person or joint: fixed amount, or variable (amount entered each time).",
  input: addSourceInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Added a recurring income", nl: "Terugkerend inkomen toegevoegd" },
  describe: (ctx, input) => say(ctx.locale, `Add the recurring income “${input.name}”`, `Terugkerend inkomen “${input.name}” toevoegen`),
  preview: async (ctx, input) => {
    const data = sourceCreateOf(ctx, input);
    const names = await entityNames(ctx, "habitant");
    return fieldsPreview(ctx.locale, ["New recurring income", "Nieuw terugkerend inkomen"], [
      [["Name", "Naam"], data.name],
      [["Person", "Persoon"], whoOf(names, data.habitantId)],
      [["Amount", "Bedrag"], data.amountMode === "fixed" ? money(data.amountCents) : `${say(ctx.locale, "variable", "variabel")}${data.estimateCents ? ` (~${money(data.estimateCents)})` : ""}`],
      [["Rhythm", "Ritme"], `${rhythm(data.rrule)}, ${say(ctx.locale, "from", "vanaf")} ${day(data.startDate, ctx.locale)}${data.endDate ? ` – ${day(data.endDate, ctx.locale)}` : ""}`],
      [["Account", "Rekening"], input.account?.name],
    ]);
  },
  run: async (ctx, input) => {
    const source = await createIncomeSource(ctx.householdId, sourceCreateOf(ctx, input));
    return done(`Added “${source.name}”, next ${day(source.nextDate)}.`, { id: source.id });
  },
});

const updateSourceInput = z.object({
  source: entityRef("income_source", "The recurring income, e.g. 'loon Clara'"),
  amount: eurosSchema.optional().describe("Fixed income: new amount"),
  from: optionalDateSchema("New amount applies from (default today; earlier months keep theirs)"),
  estimate: eurosSchema.optional().describe("Variable income: new estimate"),
  endDate: optionalDateSchema("It stops: last payment date"),
  name: z.string().trim().min(1).max(80).optional(),
  account: entityRef("account").optional(),
});

async function sourceUpdateOf(ctx: AssistantToolContext, input: z.output<typeof updateSourceInput>) {
  const { sources } = await getIncomeOverview(ctx.householdId, monthOf(todayIn()));
  const source = sources.find((item) => item.id === input.source.id);
  if (!source) throw badRequest(`Unknown recurring income ${input.source.name}`);
  if (input.amount && source.amountMode === "variable") throw badRequest(`${source.name} is variable: enter each amount with income_record_variable, or set an estimate`);
  return {
    source,
    data: incomeSourceUpdateSchema.parse({
      habitantId: source.habitantId ?? JOINT,
      name: input.name ?? source.name,
      kind: source.kind,
      rrule: source.rrule,
      startDate: source.startDate,
      endDate: input.endDate ?? source.endDate,
      amountMode: source.amountMode,
      amountCents: input.amount ? toCents(input.amount) : source.currentAmountCents,
      estimateCents: input.estimate ? toCents(input.estimate) : source.estimateCents,
      targetAccountId: input.account?.id ?? source.targetAccountId,
      notes: source.notes,
      amountFrom: input.from ?? null,
    }),
  };
}

registerAssistantTool({
  name: "income.update_source",
  description: "Change a recurring income: a new amount from a date (a raise; earlier months keep the old one), a new estimate, an end date (it stops), name or account.",
  input: updateSourceInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Changed a recurring income", nl: "Terugkerend inkomen gewijzigd" },
  describe: (ctx, input) => say(ctx.locale, `Change the recurring income ${input.source.name}`, `Terugkerend inkomen ${input.source.name} wijzigen`),
  preview: async (ctx, input) => {
    const { source, data } = await sourceUpdateOf(ctx, input);
    const change = (from: string | null | undefined, to: string | null | undefined) => ((from ?? "") === (to ?? "") ? null : `${from || "–"} → ${to || "–"}`);
    return fieldsPreview(ctx.locale, [`Change ${source.name}`, `${source.name} wijzigen`], [
      [["Amount", "Bedrag"], input.amount ? `${change(money(source.currentAmountCents), money(data.amountCents))} ${say(ctx.locale, "from", "vanaf")} ${day(input.from ?? todayIn(), ctx.locale)}` : null],
      [["Estimate", "Schatting"], change(money(source.estimateCents), money(data.estimateCents))],
      [["Ends", "Stopt"], change(day(source.endDate, ctx.locale), day(data.endDate, ctx.locale))],
      [["Name", "Naam"], change(source.name, data.name)],
      [["Account", "Rekening"], input.account?.name],
    ]);
  },
  run: async (ctx, input) => {
    const { data } = await sourceUpdateOf(ctx, input);
    const source = await updateIncomeSource(ctx.householdId, input.source.id, data);
    return done(`Changed “${source.name}”: ${money(source.currentAmountCents) ?? "variable"}${source.endDate ? `, ends ${day(source.endDate)}` : ""}.`, { id: source.id });
  },
});

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────────

const deleteInput = z.object({
  id: z.string().trim().min(1).max(64).optional().describe("Id of a recorded income from income_list history"),
  source: entityRef("income_source").optional(),
  month: optionalMonth.describe("With source: the month whose recorded payment to delete"),
});

async function findRecorded(ctx: AssistantToolContext, input: z.output<typeof deleteInput>): Promise<Income> {
  if (input.source) {
    const month = input.month ?? monthOf(todayIn());
    const { occurrences } = await getIncomeMonth(ctx.householdId, month);
    const income = occurrences.find((item) => item.sourceId === input.source?.id && item.income)?.income;
    if (!income) throw badRequest(`Nothing recorded for ${input.source.name} in ${month}`);
    return income;
  }
  if (!input.id) throw badRequest("Pass the id from income_list (history), or source and month");
  const { incomes } = await getIncomeOverview(ctx.householdId, monthOf(todayIn()));
  const income = incomes.find((item) => item.id === input.id);
  if (!income) throw badRequest("No recorded income with that id in the last two years");
  return income;
}

registerAssistantTool({
  name: "income.delete",
  description: "Delete one recorded income (wrong amount or date: delete, then record again). Recurring incomes themselves are stopped with income_update_source endDate.",
  input: deleteInput,
  permission: "sensitive",
  confirm: "always",
  roles: MONEY_ROLES,
  activity: { en: "Deleted an income", nl: "Inkomen verwijderd" },
  describe: async (ctx, input) => {
    const income = await findRecorded(ctx, input);
    return say(ctx.locale, `Delete the income of ${money(income.amountCents)} on ${day(income.date, "en")}`, `Inkomen van ${money(income.amountCents)} op ${day(income.date, "nl")} verwijderen`);
  },
  preview: async (ctx, input) => {
    const income = await findRecorded(ctx, input);
    const names = await entityNames(ctx, "habitant");
    return {
      kind: "list",
      title: say(ctx.locale, "Deleted", "Verwijderd"),
      data: { items: [{ label: `${income.description ?? input.source?.name ?? income.kind} (${whoOf(names, income.habitantId)})`, detail: `${money(income.amountCents)} · ${day(income.date, ctx.locale)}`, tone: "remove" }] },
    };
  },
  run: async (ctx, input) => {
    const income = await findRecorded(ctx, input);
    await deleteIncome(ctx.householdId, income.id);
    return done(`Deleted the income of ${money(income.amountCents)} on ${day(income.date)}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): the incomes ──

registerScreenContext({
  kind: "income",
  skills: ["income"],
  describe: (ctx) => ({ label: say(ctx.locale, "Income", "Inkomsten"), summary: "the incomes overview (income sources and received incomes)" }),
});
