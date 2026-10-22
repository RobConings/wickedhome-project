import type { Meta, StoryObj } from "@storybook/react-vite";
import { HabitantPicker } from "@/features/household/components/habitant-picker";
import { habitantFixtures } from "../fixtures";

const meta = {
  title: "Features/Household/Components/HabitantPicker",
  component: HabitantPicker,
  args: { habitants: Object.values(habitantFixtures), placeholder: "Who paid?", clearable: true },
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
} satisfies Meta<typeof HabitantPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Selected: Story = { args: { defaultValue: habitantFixtures.partner.id } };
