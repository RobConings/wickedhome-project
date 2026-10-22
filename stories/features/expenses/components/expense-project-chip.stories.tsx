import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpenseProjectChip } from "@/features/expenses/components/expense-project-chip";

const meta = {
  title: "Features/Expenses/Components/ExpenseProjectChip",
  component: ExpenseProjectChip,
  args: { project: { id: "pr-bathroom", name: "Bathroom renovation", color: "#3b82b6" } },
} satisfies Meta<typeof ExpenseProjectChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Not part of a project: nothing shows. */
export const NoProject: Story = { args: { project: null } };
