import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskList } from "@/features/tasks/components/task-list";
import { completedTodayEntries, parseTaskFilters } from "@/features/tasks/types/task-views";
import { adultViewer, completedTodayFixture, taskFixtures, taskHabitants, tasksToday } from "../fixtures";

const open = Object.values(taskFixtures).filter((task) => task.status === "open");

const meta = {
  title: "Features/Tasks/Components/TaskList",
  component: TaskList,
  parameters: { layout: "padded" },
  args: { tasks: open, grouping: "due", today: tasksToday, habitants: taskHabitants, viewer: adultViewer },
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
} satisfies Meta<typeof TaskList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ByDueDate: Story = {};
/** The total list: by day with what was closed today struck through, and "2 of 6 done" per group. */
export const WithProgress: Story = {
  args: {
    completed: completedTodayEntries(Object.values(taskFixtures), completedTodayFixture, parseTaskFilters(new URLSearchParams()), {
      today: tasksToday,
    }),
  },
};
/** Floor by floor, outside last, tasks without a place at the end. */
export const ByPlace: Story = { args: { grouping: "place" } };
export const ByPerson: Story = { args: { grouping: "assignee" } };
export const ByType: Story = { args: { grouping: "type" } };
