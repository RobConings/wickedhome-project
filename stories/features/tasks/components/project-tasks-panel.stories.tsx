import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectTasksPanel } from "@/features/tasks/components/project-tasks-panel";
import { projectTaskHabitants, projectTasksOverviewFixture } from "../../projects/fixtures";
import { emptyTasksOverviewFixture, taskPlaces } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/ProjectTasksPanel",
  component: ProjectTasksPanel,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: {
    projectId: "pr-bathroom",
    placeId: "p-bathroom",
    initialData: { overview: projectTasksOverviewFixture, habitants: projectTaskHabitants, places: taskPlaces },
  },
} satisfies Meta<typeof ProjectTasksPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Buy materials at the DIY store" → "Remove the old tiles" → "Start tiling", and one task done. */
export const Chain: Story = {};
export const NoTasks: Story = {
  args: { initialData: { overview: emptyTasksOverviewFixture, habitants: projectTaskHabitants, places: taskPlaces } },
};
/** Without data and without an API (Storybook): skeletons, then the retry state. */
export const Loading: Story = { args: { initialData: undefined } };
