import i18n from "i18next";
import {
  data,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import type { z } from "zod";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { fetchShops, type Shop } from "@/features/shops";
import { ApiRequestError } from "@/lib/api-client";
import { formDataToObject, toFormResult, type FormResult } from "@/lib/forms";
import {
  expenseCreateInputSchema,
  expenseInputSchema,
  expensePaymentInputSchema,
  recurringExpenseInputSchema,
  recurringStatusInputSchema,
  type ExpenseDetail,
  type ExpensesOverview,
  type RecurringExpenseDetail,
} from "../types/expenses";
import {
  createExpense,
  deleteExpense,
  deleteRecurringExpense,
  fetchExpenseDetail,
  fetchExpensesOverview,
  fetchRecurringExpenseDetail,
  fetchRecurringForSubscription,
  markExpensePaid,
  markExpenseUnpaid,
  setRecurringStatus,
  updateExpense,
  updateRecurringExpense,
} from "./expenses-requests";

export const EXPENSE_INTENTS = [
  "create",
  "update",
  "update-recurring",
  "recurring-status",
  "pay",
  "unpay",
  "delete",
  "delete-recurring",
] as const;
export type ExpenseIntent = (typeof EXPENSE_INTENTS)[number];

export type ExpenseActionResult = FormResult & {
  intent?: ExpenseIntent;
  /** After "create": the new expense (its first instance for a recurring one). */
  expenseId?: string;
};

export type ExpensesPageData = { overview: ExpensesOverview; habitants: Habitant[]; shops: Shop[] };
export type ExpenseDetailPageData = { detail: ExpenseDetail; habitants: Habitant[]; shops: Shop[] };
export type RecurringExpenseDetailPageData = { detail: RecurringExpenseDetail; habitants: Habitant[]; shops: Shop[] };

/** Search params of the expenses page that only filter what is loaded (no reload needed). */
export const EXPENSES_VIEW_PARAM = "view";
export const EXPENSES_PAYER_PARAM = "payer";
export const EXPENSES_KIND_PARAM = "kind";
export const EXPENSES_STATUS_PARAM = "status";
const CLIENT_PARAMS = [EXPENSES_VIEW_PARAM, EXPENSES_PAYER_PARAM, EXPENSES_KIND_PARAM, EXPENSES_STATUS_PARAM];

/**
 * Switching views and filters only filters the loaded expenses on the client, so it doesn't reload the
 * overview (which also tops up recurring expenses). Submits and other navigations revalidate as usual.
 */
export function expensesShouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  // The same address: an explicit `revalidate()` (e.g. after a mail bill was linked to an expense).
  if (currentUrl.href === nextUrl.href) return defaultShouldRevalidate;
  const withoutFilters = (url: URL) => {
    const search = new URLSearchParams(url.search);
    for (const param of CLIENT_PARAMS) search.delete(param);
    search.sort();
    return search.toString();
  };
  return withoutFilters(currentUrl) === withoutFilters(nextUrl) ? false : defaultShouldRevalidate;
}

/** Shops are only needed for the shop picker and logos: a failing shops request leaves them out. */
const loadShops = () => fetchShops().catch(() => [] as Shop[]);

export async function expensesLoader(): Promise<ExpensesPageData> {
  const [overview, household, shops] = await Promise.all([fetchExpensesOverview(), fetchHouseholdOverview(), loadShops()]);
  return { overview, habitants: household.habitants, shops };
}

function notFoundAs404(error: unknown): never {
  if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
  throw error;
}

export async function expenseDetailLoader({ params }: LoaderFunctionArgs): Promise<ExpenseDetailPageData> {
  try {
    const [detail, household, shops] = await Promise.all([
      fetchExpenseDetail(params.expenseId ?? ""),
      fetchHouseholdOverview(),
      loadShops(),
    ]);
    return { detail, habitants: household.habitants, shops };
  } catch (error) {
    return notFoundAs404(error);
  }
}

export async function recurringExpenseDetailLoader({ params }: LoaderFunctionArgs): Promise<RecurringExpenseDetailPageData> {
  try {
    const [detail, household, shops] = await Promise.all([
      fetchRecurringExpenseDetail(params.recurringId ?? ""),
      fetchHouseholdOverview(),
      loadShops(),
    ]);
    return { detail, habitants: household.habitants, shops };
  } catch (error) {
    return notFoundAs404(error);
  }
}

/** `/bills`, `/bills/:id`: the pages moved to the expenses (instances kept their ids). */
export function billsRedirectLoader({ params }: LoaderFunctionArgs) {
  return redirect(params.billId ? `/expenses/${encodeURIComponent(params.billId)}` : "/expenses");
}

/** `/subscriptions`, `/subscriptions/:id`: to the Recurring view, or the recurring expense it was migrated to. */
export async function subscriptionsRedirectLoader({ params }: LoaderFunctionArgs) {
  const fallback = `/expenses?${EXPENSES_VIEW_PARAM}=recurring`;
  if (!params.subscriptionId) return redirect(fallback);
  try {
    const { id } = await fetchRecurringForSubscription(params.subscriptionId);
    return redirect(`/expenses/recurring/${encodeURIComponent(id)}`);
  } catch {
    return redirect(fallback);
  }
}

/** Validates plain values (not FormData) with a zod schema, returning field errors like `parseForm`. */
function validate<T extends z.ZodType>(schema: T, values: Record<string, unknown>) {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data as z.infer<T> };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    // Errors inside the shares array are reported on the field as a whole.
    const key = issue.path[0] === "shares" ? "shares" : issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { errors };
}

/** The expense form posts plain fields plus `shares` as JSON. */
function expenseFormValues(formData: FormData) {
  const values = formDataToObject(formData);
  try {
    values.shares = JSON.parse(String(formData.get("shares") || "[]"));
  } catch {
    values.shares = [];
  }
  // A project field that was posted empty removes the project; a form without the field keeps it.
  if (formData.has("projectId") && !values.projectId) values.projectId = null;
  // Same for the total open amount of a loan: posted empty removes it (and its as-of date).
  if (formData.has("totalOpenCents") && !values.totalOpenCents) {
    values.totalOpenCents = null;
    values.totalOpenAsOf = null;
  }
  return values;
}

function renameKey(errors: Record<string, string[]>, from: string, to: string) {
  if (!(from in errors)) return errors;
  const { [from]: moved = [], ...rest } = errors;
  return { ...rest, [to]: [...(rest[to] ?? []), ...moved] };
}

/**
 * One action for the expenses pages; the form's `intent` field says what to do. A `redirectTo` field
 * redirects after success (used when deleting from a detail page).
 */
export async function expensesAction({ request }: ActionFunctionArgs): Promise<ExpenseActionResult | Response> {
  const formData = await request.formData();
  const intent = (formData.get("intent") as ExpenseIntent | null) ?? "create";
  const id = String(formData.get("id") ?? "");
  const redirectTo = formData.get("redirectTo");
  const done = (): ExpenseActionResult | Response =>
    typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirect(redirectTo) : { ok: true, intent };

  try {
    switch (intent) {
      case "delete":
        await deleteExpense(id);
        return done();
      case "delete-recurring":
        await deleteRecurringExpense(id);
        return done();
      case "unpay":
        await markExpenseUnpaid(id);
        return done();
      case "pay": {
        const { data: input, errors } = validate(expensePaymentInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        await markExpensePaid(id, input);
        return done();
      }
      case "recurring-status": {
        const { data: input, errors } = validate(recurringStatusInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        await setRecurringStatus(id, input);
        return done();
      }
      case "update-recurring": {
        const values = expenseFormValues(formData);
        const { data: input, errors } = validate(recurringExpenseInputSchema, { ...values, startDate: values.dueDate });
        if (errors) return { errors: renameKey(errors, "startDate", "dueDate"), intent };
        await updateRecurringExpense(id, input);
        return done();
      }
      case "update": {
        const { data: input, errors } = validate(expenseInputSchema, expenseFormValues(formData));
        if (errors) return { errors, intent };
        await updateExpense(id, input);
        return done();
      }
      case "create": {
        const { data: input, errors } = validate(expenseCreateInputSchema, expenseFormValues(formData));
        if (errors) return { errors, intent };
        const created = await createExpense(input);
        const result = done();
        return result instanceof Response ? result : { ...result, expenseId: created.id };
      }
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    const result = toFormResult(error, { not_found: i18n.t("expenses:errors.notFound") });
    return { ...result, errors: result.errors && renameKey(result.errors, "startDate", "dueDate"), intent };
  }
}
