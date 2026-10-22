import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyPeriodNav } from "@/features/energy/components/energy-period-nav";
import { TODAY } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/EnergyPeriodNav",
  component: EnergyPeriodNav,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { period: "month", date: "2026-09-01", today: TODAY },
} satisfies Meta<typeof EnergyPeriodNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreviousMonth: Story = {};
export const CurrentMonth: Story = { args: { date: "2026-10-01" } };
export const Day: Story = { args: { period: "day", date: "2026-09-15" } };
export const Week: Story = { args: { period: "week", date: "2026-09-14" } };
export const Year: Story = { args: { period: "year", date: "2025-01-01" } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
