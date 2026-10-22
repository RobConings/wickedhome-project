import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskTodayProgress } from "@/features/tasks/components/task-today-progress";

const meta = {
  title: "Features/Tasks/Components/TaskTodayProgress",
  component: TaskTodayProgress,
  parameters: { layout: "padded" },
  args: { progress: { done: 3, total: 5, allDoneToday: false, allDone: false }, overdue: 1, openTotal: 9 },
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
} satisfies Meta<typeof TaskTodayProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "3 of 5 done today", one overdue, more for later. */
export const InProgress: Story = {};
export const NothingDoneYet: Story = { args: { progress: { done: 0, total: 4, allDoneToday: false, allDone: false }, overdue: 0, openTotal: 4 } };
/** Everything for today done; later tasks remain. */
export const AllDoneToday: Story = { args: { progress: { done: 5, total: 5, allDoneToday: true, allDone: false }, overdue: 0, openTotal: 6 } };
/** Nothing open at all. */
export const AllDone: Story = { args: { progress: { done: 4, total: 4, allDoneToday: true, allDone: true }, overdue: 0, openTotal: 0 } };
export const Mobile: Story = { ...InProgress, globals: { viewport: { value: "mobile1" } } };
