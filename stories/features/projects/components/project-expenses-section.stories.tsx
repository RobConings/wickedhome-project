import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectExpensesSection } from "@/features/projects/components/project-expenses-section";
import { overBudgetDetailFixture, projectDetailFixture, projectsToday } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectExpensesSection",
  component: ProjectExpensesSection,
  args: {
    projectId: projectDetailFixture.project.id,
    today: projectsToday,
    expenses: projectDetailFixture.expenses,
    recurring: projectDetailFixture.recurring,
    canManage: true,
    renderLogExpense: ({ trigger }) => trigger,
  },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof ProjectExpensesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PaidAndUnpaid: Story = {};
export const WithRecurring: Story = { args: { expenses: overBudgetDetailFixture.expenses, recurring: overBudgetDetailFixture.recurring } };
export const Empty: Story = { args: { expenses: [], recurring: [] } };
export const AsChild: Story = { args: { canManage: false } };
