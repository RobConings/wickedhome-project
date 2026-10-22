import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DashboardScreenData } from "@/features/dashboard/data/dashboard-loaders";
import { HouseStatusCard } from "@/features/devices/components/house-status-card";
import { HouseStatusCardSkeleton } from "@/features/devices/components/house-status-card-skeleton";
import { DashboardScreen } from "@/features/dashboard/screens/dashboard-screen";
import { devicesOverviewFixture } from "../../devices/fixtures";
import { dashboardFixture, dashboardNow, emptyDashboardFixture, partlyFailedDashboardFixture } from "../fixtures";

const meta = {
  title: "Features/Dashboard/Screens/DashboardScreen",
  component: DashboardScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: dashboardFixture,
    userName: "Rob Coppens",
    now: dashboardNow,
    homeStatus: <HouseStatusCard status={devicesOverviewFixture} live={false} />,
  },
} satisfies Meta<typeof DashboardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Evening: Story = {};
export const Morning: Story = { args: { now: new Date("2026-10-02T08:15:00") } };
/** Without the route's house status (Devices) the fourth stat is left out. */
export const WithoutHomeStatus: Story = { args: { homeStatus: undefined } };

const never = new Promise<never>(() => undefined);
const loadingData: DashboardScreenData = {
  today: dashboardFixture.today,
  household: never,
  tasks: never,
  shopping: never,
  expenses: never,
  agenda: never,
  energy: never,
  weather: never,
  waste: never,
  money: never,
};

/** The page renders at once; every card shows its own skeleton until its data arrives. */
export const Loading: Story = { args: { data: loadingData, homeStatus: <HouseStatusCardSkeleton /> } };

/** Weather and waste arrive first; the rest is still loading. */
export const PartlyLoaded: Story = {
  args: { data: { ...loadingData, weather: dashboardFixture.weather, waste: dashboardFixture.waste, energy: dashboardFixture.energy } },
};
export const NewHousehold: Story = { args: { data: emptyDashboardFixture } };
/** Shopping, calendar, subscriptions, energy and weather failed to load; the rest still works. */
export const PartlyFailed: Story = { args: { data: partlyFailedDashboardFixture } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
