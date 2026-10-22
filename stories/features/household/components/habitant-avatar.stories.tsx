import type { Meta, StoryObj } from "@storybook/react-vite";
import { habitantFixtures } from "../fixtures";
import { HabitantAvatar } from "@/features/household/components/habitant-avatar";

const meta = {
  title: "Features/Household/Components/HabitantAvatar",
  component: HabitantAvatar,
  args: { habitant: habitantFixtures.owner, size: "md" },
} satisfies Meta<typeof HabitantAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};
export const Emoji: Story = { args: { habitant: habitantFixtures.pet } };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <HabitantAvatar habitant={habitantFixtures.child} size="sm" />
      <HabitantAvatar habitant={habitantFixtures.child} size="md" />
      <HabitantAvatar habitant={habitantFixtures.child} size="lg" />
    </div>
  ),
};
