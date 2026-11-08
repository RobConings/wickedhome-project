import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentAttachments } from "@/features/documents";
import { documentFiles } from "../../documents/fixtures";
import type { ReactNode } from "react";
import { useSelections } from "@/lib/selections";
import { SkeletonPage } from "@/components/shared/loading-state";
import { RecurringExpenseDetailScreen } from "@/features/expenses/screens/recurring-expense-detail-screen";
import { expenseHabitants, expenseShops, recurringExpenseDetailFixture, recurringFixtures, recurringLoanDetailFixture } from "../fixtures";

/** Forms share selection stores; seed the optional picker preferences without a backend. */
function SelectionFixtures({ children }: { children: ReactNode }) {
  useSelections("payee", { initial: {} });
  useSelections("shop", { initial: {} });
  useSelections("habitant", { initial: {} });
  return children;
}

const meta = {
  title: "Features/Expenses/Screens/RecurringExpenseDetailScreen",
  component: RecurringExpenseDetailScreen,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <SelectionFixtures><Story /></SelectionFixtures>],
  args: { detail: recurringExpenseDetailFixture, habitants: expenseHabitants, shops: expenseShops, canManage: true },
} satisfies Meta<typeof RecurringExpenseDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A down payment by transfer: upcoming instances, history and the next payment's QR. */
export const DownPayment: Story = {};
/** A loan with a total still open: € 4.027,81 of € 10.000,00 left, 5 payments to go, the last one partial. */
export const LoanWithTotalOpen: Story = { args: { detail: recurringLoanDetailFixture } };
/** A down payment with a total open amount, nothing paid yet (4 × € 230,00 + last € 80,00). */
export const DownPaymentWithTotalOpen: Story = {
  args: { detail: { ...recurringExpenseDetailFixture, recurring: recurringFixtures.brackevaWithTotal } },
};
export const Paused: Story = {
  args: { detail: { ...recurringExpenseDetailFixture, recurring: recurringFixtures.insurance, upcoming: [] } },
};
export const Ended: Story = { args: { detail: { ...recurringExpenseDetailFixture, recurring: recurringFixtures.gym, upcoming: [] } } };
export const ReadOnly: Story = { args: { canManage: false } };
export const Loading: Story = { render: () => <SkeletonPage /> };
export const Payments: Story = { parameters: { router: { initialEntries: ["/expenses/recurring/fixture?workspace=overview&from=%2Fexpenses%3Fview%3Drecurring%26kind%3Dloan"] } } };
export const StatusRejected: Story = { parameters: { router: { action: async () => ({ formError: "This schedule changed. Please refresh.", intent: "recurring-status" }) } } };

/** The route composes Documents-owned panels; reading a schedule never moves the original files. */
export const WithDocuments: Story = { args: { attachments: <DocumentAttachments entityType="subscription" entityId={recurringExpenseDetailFixture.recurring.id} canManage initialFiles={[documentFiles.brandpolis]} /> } };
export const ReadOnlyDocuments: Story = { args: { canManage: false, attachments: <DocumentAttachments entityType="subscription" entityId={recurringExpenseDetailFixture.recurring.id} canManage={false} initialFiles={[documentFiles.brandpolis]} /> } };

/** Historical links remain detachable; new uploads belong on the current schedule. */
export const OriginalDocuments: Story = { args: { attachments: <DocumentAttachments entityType="subscription" entityId="original-subscription" canManage canAttach={false} initialFiles={[documentFiles.brandpolis]} /> } };
