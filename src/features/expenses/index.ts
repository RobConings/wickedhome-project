// Public API of the expenses feature (Finance). Routes, the app frame and other features import from here only.
export {
  billsRedirectLoader,
  expenseDetailLoader,
  expensesAction,
  expensesLoader,
  expensesShouldRevalidate,
  recurringExpenseDetailLoader,
  subscriptionsRedirectLoader,
  type ExpenseDetailPageData,
  type ExpensesPageData,
  type RecurringExpenseDetailPageData,
} from "./data/expenses-loaders";
export {
  fetchExpensesSummary,
  fetchUnpaidExpenses,
  markExpensePaid,
  markExpenseUnpaid,
} from "./data/expenses-requests";
export { ExpenseDetailScreen } from "./screens/expense-detail-screen";
export { ExpensesScreen } from "./screens/expenses-screen";
export { RecurringExpenseDetailScreen } from "./screens/recurring-expense-detail-screen";
export { ExpenseCategoryIcon } from "./components/expense-category-icon";
// Integrations (mail bill rules) pick an expense category with the same select.
export { CategorySelect } from "./components/category-select";
export { NextToPay } from "./components/next-to-pay";
// Projects: the forms take an optional `projectField` slot (`ExpenseProjectField`), filled by the routes with the
// project picker; `LogExpenseDialog` (with `projectId`, `defaultAmountCents`, `action="/expenses"`, `onSaved`) logs a
// paid expense from another page, e.g. a project's.
export { LogExpenseDialog } from "./components/log-expense-dialog";
export type { ExpenseProjectField } from "./components/expense-form-dialog";
// Suggestions from other features (mail bills): `ExpenseFormDialog` with `defaults`, `action="/expenses"` and
// `onSaved(expenseId)`; the expenses page shows such a list through `ExpensesScreen`'s `suggestions` slot.
export { ExpenseFormDialog, type ExpenseFormDefaults } from "./components/expense-form-dialog";
export { amountFor, matchesPayer } from "./types/expense-calculations";
// Mail bills (integrations) show IBANs and structured communications the same way.
export { formatIban, formatStructuredCommunication } from "./types/payment-references";
// Money flow: the loans card shows each loan's progress with the same bar as the expenses pages.
export { TotalOpenProgressBar } from "./components/total-open-progress";
export { totalOpenPaidPercent, type TotalOpenProgress } from "./types/total-open";
export {
  canManageExpenses,
  type Expense,
  type ExpenseCategory,
  type ExpenseFlowItem,
  type ExpenseKind,
  type ExpensesSummary,
  type LoanSummary,
  type PayeeSuggestion,
  type PaymentMethod,
  type RecurringExpense,
} from "./types/expenses";
