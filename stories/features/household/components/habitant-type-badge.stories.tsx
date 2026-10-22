import type { Meta, StoryObj } from "@storybook/react-vite";
import { HabitantTypeBadge } from "@/features/household/components/habitant-type-badge";

const meta = {
  title: "Features/Household/Components/HabitantTypeBadge",
  component: HabitantTypeBadge,
  args: { type: "adult" },
} satisfies Meta<typeof HabitantTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTypes: Story = {
  render: () => (
    <div className="flex gap-2">
      <HabitantTypeBadge type="adult" />
      <HabitantTypeBadge type="child" />
      <HabitantTypeBadge type="pet" />
      <HabitantTypeBadge type="guest" />
    </div>
  ),
};
