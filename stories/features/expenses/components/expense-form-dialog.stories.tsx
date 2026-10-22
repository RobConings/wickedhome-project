import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { ExpenseFormDialog } from "@/features/expenses/components/expense-form-dialog";
import type { RecurringExpense } from "@/features/expenses/types/expenses";
import { totalOpenProgress } from "@/features/expenses/types/total-open";
import { expenseFixtures, expenseHabitants, expenseShops, expensesToday, payeeFixtures, recurringFixtures } from "../fixtures";

/** The recurring expense with another total open, nothing paid yet, counted from its next due date. */
const withTotalOpen = (recurring: RecurringExpense, totalOpenCents: number): RecurringExpense => ({
  ...recurring,
  totalOpen: totalOpenProgress({
    amountCents: recurring.amountCents,
    totalOpenCents,
    asOf: recurring.nextDueDate ?? recurring.startDate,
    rrule: recurring.rrule,
    startDate: recurring.startDate,
    generatedUntil: null,
    status: recurring.status,
    instances: [],
  }),
});

const meta = {
  title: "Features/Expenses/Components/ExpenseFormDialog",
  component: ExpenseFormDialog,
  args: {
    habitants: expenseHabitants,
    shops: expenseShops,
    payees: payeeFixtures,
    today: expensesToday,
    defaultOpen: true,
    trigger: <Button>New expense</Button>,
  },
} satisfies Meta<typeof ExpenseFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One-off: switch "Repeats" on for a recurring expense. */
export const CreateOneOff: Story = {};
/** Wire transfer with a structured communication (OGM): beneficiary, IBAN, BIC and communication show. */
export const EditWireTransferWithOgm: Story = { args: { expense: expenseFixtures.watergroep } };
/** Free-text reference, paid by one person. */
export const EditFreeReferencePerson: Story = { args: { expense: expenseFixtures.hendrickx } };
/** Split between two people. */
export const EditSplit: Story = { args: { expense: expenseFixtures.verisure } };
/** An instance of a recurring expense: choose "this one" or "this and all upcoming ones". */
export const EditInstanceOfRecurring: Story = { args: { expense: expenseFixtures.loanOctober, recurring: recurringFixtures.loan } };
/** The recurring template itself (from its detail page). */
export const EditRecurring: Story = { args: { recurring: recurringFixtures.brackeva } };
/** A loan with a total still open (partial last payment): the end is set from it and shown read-only. */
export const LoanTotalOpenPartial: Story = { args: { recurring: recurringFixtures.houseLoan } };
/** A down payment whose total divides evenly: 10 payments of € 230,00, no partial one. */
export const DownPaymentTotalOpenDivisible: Story = { args: { recurring: withTotalOpen(recurringFixtures.brackevaWithTotal, 230_000) } };
/** A total smaller than one payment: one payment of € 80,00. */
export const DownPaymentTotalOpenSmallerThanOnePayment: Story = {
  args: { recurring: withTotalOpen(recurringFixtures.brackevaWithTotal, 8000) },
};
/** Another kind (subscription) keeps "Total still open" under the collapsed "Paying something off?". */
export const SubscriptionTotalOpenUnderMore: Story = { args: { recurring: recurringFixtures.netflix } };
export const ValidationErrors: Story = {
  parameters: {
    router: {
      action: async () => ({
        intent: "create",
        errors: { payee: ["Required"], amountCents: ["Too small"], structuredCommunication: ["Invalid"], shares: ["Must add up"] },
      }),
    },
  },
};
