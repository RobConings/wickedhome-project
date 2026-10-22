import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectTile } from "@/features/projects/components/project-tile";
import { projectFixtures, projectListFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectTile",
  component: ProjectTile,
  args: { project: projectFixtures.bathroom },
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
} satisfies Meta<typeof ProjectTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InBudget: Story = {};
/** Above 90 % of the budget (spent + committed). */
export const AtRisk: Story = { args: { project: projectFixtures.christmas } };
export const OverBudget: Story = { args: { project: projectFixtures.skiTrip } };
export const NoBudget: Story = { args: { project: projectFixtures.garden } };
export const Done: Story = { args: { project: projectFixtures.done } };

/** Every budget state side by side, two per row like on a phone. */
export const AllStates: Story = {
  decorators: [(Story) => <div className="w-[22rem]">{Story()}</div>],
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      {projectListFixture.map((project) => (
        <ProjectTile key={project.id} project={project} />
      ))}
    </div>
  ),
};
