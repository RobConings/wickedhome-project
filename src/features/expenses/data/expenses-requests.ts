import { api, resourcePath } from "@/lib/api-client";
import type {
  Expense,
  ExpenseCreateInput,
  ExpenseDetail,
  ExpenseInput,
  ExpensePaymentInput,
  ExpensesOverview,
  ExpensesSummary,
  RecurringExpense,
  RecurringExpenseDetail,
  RecurringExpenseInput,
  RecurringStatusInput,
} from "../types/expenses";

const expensePath = resourcePath("/expenses");
const recurringPath = resourcePath("/expenses/recurring");

export const fetchExpensesOverview = () => api.get<ExpensesOverview>("/expenses");
export const fetchExpensesSummary = () => api.get<ExpensesSummary>("/expenses/summary");
/** Unpaid expenses due within two months, overdue included, soonest first ("Next to pay" elsewhere). */
export const fetchUnpaidExpenses = () => api.get<Expense[]>("/expenses/unpaid");
export const fetchExpenseDetail = (id: string) => api.get<ExpenseDetail>(expensePath(id));
export const fetchRecurringExpenseDetail = (id: string) => api.get<RecurringExpenseDetail>(recurringPath(id));
export const fetchRecurringForSubscription = (subscriptionId: string) =>
  api.get<{ id: string }>(recurringPath("by-subscription", subscriptionId));

export const createExpense = (input: ExpenseCreateInput) => api.post<Expense>("/expenses", input);
export const updateExpense = (id: string, input: ExpenseInput) => api.put<Expense>(expensePath(id), input);
export const deleteExpense = (id: string) => api.delete(expensePath(id));
export const markExpensePaid = (id: string, input: ExpensePaymentInput) => api.put<Expense>(expensePath(id, "payment"), input);
export const markExpenseUnpaid = (id: string) => api.delete<Expense>(expensePath(id, "payment"));
export const updateRecurringExpense = (id: string, input: RecurringExpenseInput) =>
  api.put<RecurringExpense>(recurringPath(id), input);
export const setRecurringStatus = (id: string, input: RecurringStatusInput) =>
  api.put<RecurringExpense>(recurringPath(id, "status"), input);
export const deleteRecurringExpense = (id: string) => api.delete(recurringPath(id));
