import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpenseAccountPanel } from "@/features/money/components/expense-account-panel";
const initial = { expenseId: "expense", status: "posted" as const, account: { id: "joint", name: "Household account" }, month: "2026-10", amountCents: -4500, lineKey: "expense:expense" };
const meta = { title: "Features/Money/Components/ExpenseAccountPanel", component: ExpenseAccountPanel, parameters: { layout: "padded", router: { initialEntries: ["/expenses/expense?from=%2Fpurchases%2Facquisition"] } }, args: { expenseId: "expense", initial } } satisfies Meta<typeof ExpenseAccountPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Unpaid: Story = { args: { initial: { ...initial, status: "unpaid", account: null, amountCents: null, lineKey: null } } };
export const OutsideHistory: Story = { args: { initial: { ...initial, status: "outsideHistory", amountCents: null, lineKey: null } } };
