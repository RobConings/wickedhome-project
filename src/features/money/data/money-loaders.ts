import i18n from "i18next";
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { internalOrigin, withRecordOrigin } from "@/lib/record-navigation";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import {
  accountCreateSchema,
  accountUpdateSchema,
  contributionPlanSchema,
  directPaymentSchema,
  keepExtraSchema,
  moneyMonthSchema,
  otherEntrySchema,
  planAmountsSchema,
  recordTransferSchema,
  setBalanceSchema,
  takeBackSchema,
  type MoneyMonth,
} from "../types/money";
import {
  addOtherEntry,
  createAccount,
  createPlan,
  deleteEntry,
  deletePlan,
  fetchMoneyMonth,
  recordDirectPayment,
  recordTransfer,
  setAccountBalance,
  setKeptExtra,
  setPlanAmounts,
  takeBackContribution,
  updateAccount,
  updatePlan,
} from "./money-requests";

export const MONEY_INTENTS = [
  "create-account",
  "update-account",
  "set-balance",
  "record-transfer",
  "other-entry",
  "delete-entry",
  "create-plan",
  "update-plan",
  "delete-plan",
  "take-back",
  "keep-extra",
  "direct-payment",
  "update-plan-amounts",
] as const;
export type MoneyIntent = (typeof MONEY_INTENTS)[number];

export type MoneyActionResult = FormResult & { intent?: MoneyIntent; planId?: string };

export type MoneyPageData = { month: MoneyMonth; habitants: Habitant[] };

/** The month shown: `?month=YYYY-MM`, default the current month. */
export const MONEY_MONTH_PARAM = "month";

/** `?month=` of a request, when valid. */
export function requestedMonth(request: Request): string | null {
  const value = new URL(request.url).searchParams.get(MONEY_MONTH_PARAM);
  return value && moneyMonthSchema.safeParse(value).success ? value : null;
}

export async function moneyLoader({ request }: LoaderFunctionArgs): Promise<MoneyPageData> {
  const [month, household] = await Promise.all([fetchMoneyMonth(requestedMonth(request)), fetchHouseholdOverview()]);
  return { month, habitants: household.habitants };
}

export async function contributionPlanLoader(args: LoaderFunctionArgs) {
  const page = await moneyLoader(args);
  const plan = page.month.plans.find((candidate) => candidate.id === args.params.planId);
  if (!plan) throw data(null, { status: 404 });
  return { ...page, plan };
}

export async function contributionPlanAction(args: ActionFunctionArgs) {
  const result = await moneyAction(args);
  if (!result.ok) return result;
  const url = new URL(args.request.url);
  if (result.intent === "delete-plan") return redirect(internalOrigin(url.searchParams.get("from")) ?? "/money?tab=settlement");
  // A later effective amount creates a new plan and preserves the old period.
  if (result.intent === "update-plan" && result.planId && result.planId !== args.params.planId) {
    return redirect(withRecordOrigin(`/money/plans/${encodeURIComponent(result.planId)}?month=${requestedMonth(args.request) ?? ""}`, `${url.pathname}${url.search}`));
  }
  return result;
}

/** One action for the money flow page; the form's `intent` says what to do. */
export async function moneyAction({ request }: ActionFunctionArgs): Promise<MoneyActionResult> {
  const formData = await request.formData();
  const intent = (formData.get("intent") as MoneyIntent | null) ?? "record-transfer";
  const id = String(formData.get("id") ?? "");

  try {
    switch (intent) {
      case "create-account": {
        const { data, errors } = parseForm(accountCreateSchema, formData);
        if (errors) return { errors, intent };
        await createAccount(data);
        return { ok: true, intent };
      }
      case "update-account": {
        const { data, errors } = parseForm(accountUpdateSchema, formData);
        if (errors) return { errors, intent };
        await updateAccount(id, data);
        return { ok: true, intent };
      }
      case "set-balance": {
        const { data, errors } = parseForm(setBalanceSchema, formData);
        if (errors) return { errors, intent };
        await setAccountBalance(id, data);
        return { ok: true, intent };
      }
      case "record-transfer": {
        const { data, errors } = parseForm(recordTransferSchema, formData);
        if (errors) return { errors, intent };
        await recordTransfer(data);
        return { ok: true, intent };
      }
      case "other-entry": {
        const { data, errors } = parseForm(otherEntrySchema, formData);
        if (errors) return { errors, intent };
        await addOtherEntry(id, data);
        return { ok: true, intent };
      }
      case "delete-entry":
        await deleteEntry(id);
        return { ok: true, intent };
      case "create-plan": {
        const { data, errors } = parseForm(contributionPlanSchema, formData);
        if (errors) return { errors, intent };
        const plan = await createPlan(data);
        return { ok: true, intent, planId: plan.id };
      }
      case "update-plan": {
        const { data, errors } = parseForm(contributionPlanSchema, formData);
        if (errors) return { errors, intent };
        const plan = await updatePlan(id, data);
        return { ok: true, intent, planId: plan.id };
      }
      case "delete-plan":
        await deletePlan(id);
        return { ok: true, intent };
      case "take-back": {
        const { data, errors } = parseForm(takeBackSchema, formData);
        if (errors) return { errors, intent };
        await takeBackContribution(data);
        return { ok: true, intent };
      }
      case "keep-extra": {
        const { data, errors } = parseForm(keepExtraSchema, formData);
        if (errors) return { errors, intent };
        await setKeptExtra(data);
        return { ok: true, intent };
      }
      case "direct-payment": {
        const { data, errors } = parseForm(directPaymentSchema, formData);
        if (errors) return { errors, intent };
        await recordDirectPayment(data);
        return { ok: true, intent };
      }
      case "update-plan-amounts": {
        const { data, errors } = parseForm(planAmountsSchema, formData);
        if (errors) return { errors, intent };
        await setPlanAmounts(data);
        return { ok: true, intent };
      }
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    const result = toFormResult(error, {
      not_found: i18n.t("money:errors.notFound"),
      conflict: i18n.t("money:errors.openingBalance"),
    });
    return { ...result, intent };
  }
}
