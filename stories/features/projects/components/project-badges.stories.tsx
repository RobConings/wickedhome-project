import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectBudgetBadge, ProjectStatusBadge } from "@/features/projects/components/project-badges";
import { PROJECT_STATUSES } from "@/features/projects/types/projects";
import { projectFixtures } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectBadges",
  component: ProjectBudgetBadge,
  args: { budget: projectFixtures.bathroom.budget },
} satisfies Meta<typeof ProjectBudgetBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BudgetStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ProjectBudgetBadge budget={projectFixtures.bathroom.budget} />
      <ProjectBudgetBadge budget={projectFixtures.christmas.budget} />
      <ProjectBudgetBadge budget={projectFixtures.skiTrip.budget} />
    </div>
  ),
};

export const Statuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {PROJECT_STATUSES.map((status) => (
        <ProjectStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
