import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectBudgetCard } from "@/features/projects/components/project-budget-card";
import { projectFixtures } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectBudgetCard",
  component: ProjectBudgetCard,
  args: { budget: projectFixtures.bathroom.budget },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof ProjectBudgetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In budget, with one material without a price. */
export const InBudget: Story = {};
export const AtRisk: Story = { args: { budget: projectFixtures.christmas.budget } };
export const OverBudget: Story = { args: { budget: projectFixtures.skiTrip.budget } };
export const NoBudget: Story = { args: { budget: projectFixtures.garden.budget } };
