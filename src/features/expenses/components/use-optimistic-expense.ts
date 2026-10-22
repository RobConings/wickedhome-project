import { useFetchers } from "react-router";
import { expenseStatus } from "../types/expense-calculations";
import type { Expense } from "../types/expenses";

type PaymentFields = Pick<Expense, "id" | "dueDate" | "status" | "paidOn" | "paidById" | "autoPaid">;

/**
 * The expense as it will be once a "mark as paid" / "mark as unpaid" that is being saved for it succeeds,
 * read from any fetcher on the page (the pay dialog, the unpay button). When the save fails, the
 * fetcher's form data goes away and the expense shows its real state again.
 */
export function useOptimisticExpense<T extends PaymentFields>(expense: T, today: string): T {
  const fetchers = useFetchers();
  const pending = fetchers.find((fetcher) => {
    const intent = fetcher.formData?.get("intent");
    return (intent === "pay" || intent === "unpay") && fetcher.formData?.get("id") === expense.id;
  });
  if (!pending?.formData) return expense;

  if (pending.formData.get("intent") === "unpay") {
    return {
      ...expense,
      status: expenseStatus({ dueDate: expense.dueDate, paidOn: null }, today),
      paidOn: null,
      paidById: null,
      autoPaid: false,
    };
  }
  const paidOn = String(pending.formData.get("paidOn") || today);
  const paidById = String(pending.formData.get("paidById") || "") || null;
  return { ...expense, status: "paid", paidOn, paidById };
}
