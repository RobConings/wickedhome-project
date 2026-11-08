import i18n from "i18next";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { ApiRequestError } from "@/lib/api-client";
import { monthOf, todayIn } from "@/types/dates";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import {
  incomeInputSchema,
  incomeSourceCreateSchema,
  incomeSourceUpdateSchema,
  monthSchema,
  type IncomeOverview,
} from "../types/income";
import {
  createIncome,
  createIncomeSource,
  deleteIncome,
  deleteIncomeAmount,
  deleteIncomeSource,
  fetchIncomeOverview,
  fetchIncome,
  fetchIncomeSource,
  updateIncome,
  updateIncomeSource,
} from "./income-requests";

export const INCOME_INTENTS = [
  "create-source",
  "update-source",
  "delete-source",
  "delete-amount",
  "create-income",
  "update-income",
  "delete-income",
] as const;
export type IncomeIntent = (typeof INCOME_INTENTS)[number];

export type IncomeActionResult = FormResult & { intent?: IncomeIntent };

export type IncomePageData = { overview: IncomeOverview; habitants: Habitant[] };

/** The month shown: `?month=YYYY-MM`, default the current month. */
export const INCOME_MONTH_PARAM = "month";

export async function incomeLoader({ request }: LoaderFunctionArgs): Promise<IncomePageData> {
  const requested = new URL(request.url).searchParams.get(INCOME_MONTH_PARAM);
  const month = requested && monthSchema.safeParse(requested).success ? requested : null;
  const [overview, household] = await Promise.all([fetchIncomeOverview(month), fetchHouseholdOverview()]);
  return { overview, habitants: household.habitants };
}

/** One action for the income page; the form's `intent` says what to do. */
export async function incomeAction({ request }: ActionFunctionArgs): Promise<IncomeActionResult> {
  const formData = await request.formData();
  const intent = (formData.get("intent") as IncomeIntent | null) ?? "create-income";
  const id = String(formData.get("id") ?? "");

  try {
    switch (intent) {
      case "create-source": {
        const { data, errors } = parseForm(incomeSourceCreateSchema, formData);
        if (errors) return { errors, intent };
        await createIncomeSource(data);
        return { ok: true, intent };
      }
      case "update-source": {
        const { data, errors } = parseForm(incomeSourceUpdateSchema, formData);
        if (errors) return { errors, intent };
        await updateIncomeSource(id, data);
        return { ok: true, intent };
      }
      case "delete-source":
        await deleteIncomeSource(id);
        return { ok: true, intent };
      case "delete-amount":
        await deleteIncomeAmount(id, String(formData.get("amountId") ?? ""));
        return { ok: true, intent };
      case "create-income": {
        const { data, errors } = parseForm(incomeInputSchema, formData);
        if (errors) return { errors, intent };
        await createIncome(data);
        return { ok: true, intent };
      }
      case "update-income": {
        const { data, errors } = parseForm(incomeInputSchema, formData);
        if (errors) return { errors, intent };
        await updateIncome(id, data);
        return { ok: true, intent };
      }
      case "delete-income":
        await deleteIncome(id);
        return { ok: true, intent };
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    const result = toFormResult(error, {
      not_found: i18n.t("income:errors.notFound"),
      conflict: i18n.t("income:errors.A fixed income keeps at least one amount"),
    });
    return { ...result, intent };
  }
}

export async function incomeRecordLoader(args: LoaderFunctionArgs) {
  try {
    const base = await incomeLoader(args);
    const income = await fetchIncome(args.params.incomeId!);
    const source = income.sourceId ? (await fetchIncomeSource(income.sourceId, `?month=${income.periodDate?.slice(0, 7) ?? monthOf(todayIn())}`)).source : null;
    return { ...base, income, source };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw new Response(null, { status: 404 });
    throw error;
  }
}

export async function incomeSourceLoader(args: LoaderFunctionArgs) {
  try {
    const base = await incomeLoader(args);
    const params = new URL(args.request.url).searchParams;
    const query = new URLSearchParams({ month: base.overview.month });
    if (params.has("page")) query.set("page", params.get("page")!);
    const detail = await fetchIncomeSource(args.params.sourceId!, `?${query}`);
    return { ...base, detail };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw new Response(null, { status: 404 });
    throw error;
  }
}

/** A deleted record returns to its owner index; edits retain the precise source context. */
export async function incomeRecordAction(args: ActionFunctionArgs) {
  const result = await incomeAction(args);
  if (result.ok && (result.intent === "delete-income" || result.intent === "delete-source")) return redirect("/income");
  return result;
}
