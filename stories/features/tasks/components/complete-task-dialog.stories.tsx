import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { CompleteTaskDialog } from "@/features/tasks/components/complete-task-dialog";
import { taskFixtures, taskHabitants } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/CompleteTaskDialog",
  component: CompleteTaskDialog,
  args: {
    task: taskFixtures.vacuum,
    habitants: taskHabitants,
    currentHabitantId: "h1",
    canChooseWho: true,
    trigger: <Button>Mark as done</Button>,
  },
} satisfies Meta<typeof CompleteTaskDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recurring: Story = {};
export const OneOff: Story = { args: { task: taskFixtures.jacuzzi } };
export const AsChild: Story = { args: { task: taskFixtures.schoolBag, currentHabitantId: "h3", canChooseWho: false } };

/** Saving: the dialog stays open with a busy button and disabled fields until the save is done. */
export const Saving: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Mark as done" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as done" }));
  },
};
