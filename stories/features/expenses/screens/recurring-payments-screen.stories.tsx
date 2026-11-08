import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecurringPaymentsScreen } from "@/features/expenses/screens/recurring-payments-screen";
import { expenseHabitants, recurringExpenseDetailFixture } from "../fixtures";
const payments = { recurring: recurringExpenseDetailFixture.recurring, today: recurringExpenseDetailFixture.today, items: recurringExpenseDetailFixture.history, page: 2, pageSize: 25, total: 56 };
const meta = { title: "Features/Expenses/Screens/RecurringPaymentsScreen", component: RecurringPaymentsScreen, parameters: { layout: "fullscreen", router: { initialEntries: ["/expenses/recurring/series/payments?status=paid&page=2&from=%2Fexpenses%2Frecurring%2Fseries%3Fworkspace%3Doverview"] } }, args: { payments, habitants: expenseHabitants } } satisfies Meta<typeof RecurringPaymentsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { payments: { ...payments, items: [], page: 1, total: 0 } } };
