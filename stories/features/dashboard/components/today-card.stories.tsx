import type { Meta, StoryObj } from "@storybook/react-vite";
import { TodayCard } from "@/features/dashboard/components/today-card";
import { dashboardFixture, dashboardToday } from "../fixtures";

const meta = {
  title: "Features/Dashboard/Components/TodayCard",
  component: TodayCard,
  decorators: [(Story) => <div className="w-[26rem] max-w-full">{Story()}</div>],
  args: { today: dashboardToday, agenda: dashboardFixture.agenda, tasks: dashboardFixture.tasks },
} satisfies Meta<typeof TodayCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NothingPlanned: Story = {
  args: { agenda: dashboardFixture.agenda && { ...dashboardFixture.agenda, entries: [] }, tasks: dashboardFixture.tasks && { ...dashboardFixture.tasks, upcoming: [] } },
};
export const CalendarFailed: Story = { args: { agenda: null } };
export const EverythingFailed: Story = { args: { agenda: null, tasks: null } };
