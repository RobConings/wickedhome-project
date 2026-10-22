import type { Meta, StoryObj } from "@storybook/react-vite";
import type { EnergySetup, EnergySummary } from "@/features/energy/types/energy";
import { EnergyOverviewScreen } from "@/features/energy/screens/energy-overview-screen";
import {
  TODAY,
  daySummaryFixture,
  emptySetupFixture,
  emptySummaryFixture,
  gasDaySummaryFixture,
  gasEmptySummaryFixture,
  gasMonthSummaryFixture,
  gasYearSummaryFixture,
  totalWithoutGasSummaryFixture,
  totalYearSummaryFixture,
  gridOnlySummaryFixture,
  monthSummaryFixture,
  nothingMeasuredSummaryFixture,
  setupFixture,
  weekSummaryFixture,
  yearSummaryFixture,
} from "../fixtures";

/** The screen's props for a summary: the loaded data plus the period and tab it is for. */
const view = (summary: EnergySummary, setup: EnergySetup = setupFixture) => ({
  overview: { summary, setup },
  carrier: summary.carrier,
  period: summary.period,
  date: summary.from,
});

const meta = {
  title: "Features/Energy/Screens/EnergyOverviewScreen",
  component: EnergyOverviewScreen,
  parameters: { layout: "fullscreen", router: { initialEntries: ["/energy"] } },
  args: { ...view(monthSummaryFixture), today: TODAY, canManage: true },
} satisfies Meta<typeof EnergyOverviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {};
export const Day: Story = { args: view(daySummaryFixture) };
export const Week: Story = { args: view(weekSummaryFixture) };
export const Year: Story = { args: view(yearSummaryFixture) };
/** Only the Fluvius file: honest notice instead of a wrong consumption figure. */
export const SolarNotMeasured: Story = { args: view(gridOnlySummaryFixture) };
export const NothingMeasuredYet: Story = { args: view(nothingMeasuredSummaryFixture) };
export const Empty: Story = { args: view(emptySummaryFixture, emptySetupFixture) };
export const AsChild: Story = { args: { canManage: false } };
export const GasMonth: Story = { args: view(gasMonthSummaryFixture) };
export const GasWinterDay: Story = { args: view(gasDaySummaryFixture) };
export const GasYear: Story = { args: view(gasYearSummaryFixture) };
export const GasEmpty: Story = { args: view(gasEmptySummaryFixture) };
/** Electricity and gas together in kWh. */
export const TotalYear: Story = { args: view(totalYearSummaryFixture) };
export const TotalWithoutGas: Story = { args: view(totalWithoutGasSummaryFixture) };

/** Loading: the header, tabs and period render at once; skeletons shaped like the figures wait for the summary. */
export const Loading: Story = { args: { overview: new Promise<never>(() => {}) } };
export const LoadingGas: Story = { args: { overview: new Promise<never>(() => {}), carrier: "gas" } };
/** Pending: another period or tab is loading; the current figures fade with a "Loading …" label. */
export const Pending: Story = { args: { pending: true } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
