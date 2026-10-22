import type { Meta, StoryObj } from "@storybook/react-vite";
import { habitantFixtures } from "../fixtures";
import { HabitantActions } from "@/features/household/components/habitant-actions";

const meta = {
  title: "Features/Household/Components/HabitantActions",
  component: HabitantActions,
  args: { habitant: habitantFixtures.partner },
} satisfies Meta<typeof HabitantActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On tiles: labels from `sm` up, icons only on phones. */
export const Default: Story = {};
/** In list rows: icons only. */
export const IconOnly: Story = { args: { iconOnly: true } };
/** A habitant with a login can't be deleted; the tooltip says why. */
export const HasLogin: Story = { args: { habitant: habitantFixtures.owner } };
