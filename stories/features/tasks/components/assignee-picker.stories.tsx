import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssigneePicker } from "@/features/tasks/components/assignee-picker";
import { taskHabitants } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/AssigneePicker",
  component: AssigneePicker,
  args: { habitants: taskHabitants, name: "assigneeIds", label: "Who" },
} satisfies Meta<typeof AssigneePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Nobody: Story = {};
export const One: Story = { args: { defaultValue: ["h3"] } };
/** Numbers show the rotation order. */
export const RotationOrder: Story = { args: { defaultValue: ["h3", "h1", "h2"] } };
