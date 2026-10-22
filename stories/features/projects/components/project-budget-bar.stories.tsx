import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectBudgetBar } from "@/features/projects/components/project-budget-bar";
import { projectFixtures } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectBudgetBar",
  component: ProjectBudgetBar,
  args: { budget: projectFixtures.bathroom.budget },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof ProjectBudgetBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InBudget: Story = {};
export const AtRisk: Story = { args: { budget: projectFixtures.christmas.budget } };
export const OverBudget: Story = { args: { budget: projectFixtures.skiTrip.budget } };
export const NoBudget: Story = { args: { budget: projectFixtures.garden.budget } };
export const WithoutLegend: Story = { args: { showLegend: false } };
