import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpenseAllocationPanel } from "@/features/expenses/components/expense-allocation-panel";

const meta = { title: "Features/Expenses/Components/ExpenseAllocationPanel", component: ExpenseAllocationPanel, parameters: { layout: "padded" }, args: { expenseId: "expense", initialProjects: [{ id: "bathroom", name: "Bathroom" }], initial: { expenseId: "expense", revision: "2026-11-07T10:00:00Z", totalCents: 4500, householdCents: 1000, unallocatedCents: 0, explicit: true, projects: [{ projectId: "bathroom", name: "Bathroom", amountCents: 3500 }] } } } satisfies Meta<typeof ExpenseAllocationPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

