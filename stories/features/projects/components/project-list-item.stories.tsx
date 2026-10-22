import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectListItem } from "@/features/projects/components/project-list-item";
import { projectFixtures, projectListFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectListItem",
  component: ProjectListItem,
  args: { project: projectFixtures.bathroom },
  decorators: [(Story) => <div className="max-w-2xl rounded-xl border bg-card p-4">{Story()}</div>],
} satisfies Meta<typeof ProjectListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InBudget: Story = {};
export const OverBudget: Story = { args: { project: projectFixtures.skiTrip } };
export const NoBudget: Story = { args: { project: projectFixtures.garden } };

export const List: Story = {
  render: () => (
    <div className="flex flex-col divide-y [&>*]:py-3">
      {projectListFixture.map((project) => (
        <ProjectListItem key={project.id} project={project} />
      ))}
    </div>
  ),
};
