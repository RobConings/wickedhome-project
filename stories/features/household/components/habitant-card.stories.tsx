import type { Meta, StoryObj } from "@storybook/react-vite";
import { habitantFixtures } from "../fixtures";
import { HabitantCard } from "@/features/household/components/habitant-card";

const meta = {
  title: "Features/Household/Components/HabitantCard",
  component: HabitantCard,
  decorators: [(Story) => <div className="w-80"><Story /></div>],
  args: { habitant: habitantFixtures.partner, canManage: true },
} satisfies Meta<typeof HabitantCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithLogin: Story = { args: { habitant: habitantFixtures.owner } };
export const Pet: Story = { args: { habitant: habitantFixtures.pet } };
export const ReadOnly: Story = { args: { canManage: false } };
