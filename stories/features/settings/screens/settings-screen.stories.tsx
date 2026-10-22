import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsScreen } from "@/features/settings/screens/settings-screen";
import { householdOverviewFixture } from "../../household/fixtures";
import { emptyHouseholdSettingsFixture, householdSettingsFixture } from "../../household/settings-fixtures";
import { WASTE_TODAY, unconfiguredWasteSettingsFixture, wasteSettingsFixture } from "../../waste/fixtures";
import { weatherSettingsFixture } from "../../weather/fixtures";

const meta = {
  title: "Features/Settings/Screens/SettingsScreen",
  component: SettingsScreen,
  parameters: { layout: "fullscreen" },
  args: { data: { today: WASTE_TODAY, household: householdSettingsFixture, waste: wasteSettingsFixture, weather: weatherSettingsFixture, habitants: householdOverviewFixture.habitants }, canManage: true },
} satisfies Meta<typeof SettingsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** A new household: no address, no collector. */
export const FirstVisit: Story = {
  args: { data: { today: WASTE_TODAY, household: emptyHouseholdSettingsFixture, waste: unconfiguredWasteSettingsFixture, weather: { ...weatherSettingsFixture, providerId: "open-meteo", last: null }, habitants: [] } },
};
export const ReadOnly: Story = { args: { canManage: false } };
/** The waste section failed to load; the household section still works. */
export const SectionFailed: Story = { args: { data: { today: WASTE_TODAY, household: householdSettingsFixture, waste: null, weather: weatherSettingsFixture, habitants: [] } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
