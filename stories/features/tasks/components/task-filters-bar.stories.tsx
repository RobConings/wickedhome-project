import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskFiltersBar } from "@/features/tasks/components/task-filters-bar";
import type { TaskFilters } from "@/features/tasks/types/task-views";
import { taskHabitants } from "../fixtures";

const counts = { mine: 4, all: 7, ready: 5, overdue: 1, done: 1 };
const initial: TaskFilters = { view: "mine", assignee: null, type: null, location: null, place: null, group: "due" };

const meta = {
  title: "Features/Tasks/Components/TaskFiltersBar",
  component: TaskFiltersBar,
  parameters: { layout: "padded" },
  args: { filters: initial, counts, habitants: taskHabitants, onChange: () => {} },
  render: (args) => {
    const [filters, setFilters] = React.useState(args.filters);
    return <TaskFiltersBar {...args} filters={filters} onChange={setFilters} />;
  },
} satisfies Meta<typeof TaskFiltersBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const OutsideByPlace: Story = { args: { filters: { ...initial, view: "all", location: "outside", group: "place" } } };
export const JobsByType: Story = { args: { filters: { ...initial, view: "all", type: "job", group: "type" } } };
export const OnePlace: Story = { args: { filters: { ...initial, view: "all", place: "p-jacuzzi" }, placeName: "Jacuzzi" } };
export const WithoutMine: Story = { args: { showMine: false, filters: { ...initial, view: "all" } } };
