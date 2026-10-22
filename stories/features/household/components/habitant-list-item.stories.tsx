import type { Meta, StoryObj } from "@storybook/react-vite";
import { habitantFixtures } from "../fixtures";
import { HabitantListItem } from "@/features/household/components/habitant-list-item";

const meta = {
  title: "Features/Household/Components/HabitantListItem",
  component: HabitantListItem,
  decorators: [(Story) => <div className="w-[22rem] rounded-xl border bg-card px-4 py-2.5"><Story /></div>],
  args: { habitant: habitantFixtures.partner, canManage: true },
} satisfies Meta<typeof HabitantListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithLogin: Story = { args: { habitant: habitantFixtures.owner } };
export const Pet: Story = { args: { habitant: habitantFixtures.pet } };
export const ReadOnly: Story = { args: { canManage: false } };
