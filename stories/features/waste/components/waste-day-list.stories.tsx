import type { Meta, StoryObj } from "@storybook/react-vite";
import { WasteDayList } from "@/features/waste/components/waste-day-list";
import { WASTE_TODAY, wasteDaysFixture } from "../fixtures";

const meta = {
  title: "Features/Waste/Components/WasteDayList",
  component: WasteDayList,
  decorators: [(Story) => <div className="w-[28rem] max-w-full">{Story()}</div>],
  args: { days: wasteDaysFixture, today: WASTE_TODAY },
} satisfies Meta<typeof WasteDayList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Narrow: Story = { decorators: [(Story) => <div className="w-64">{Story()}</div>] };
