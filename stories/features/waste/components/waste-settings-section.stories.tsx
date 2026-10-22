import type { Meta, StoryObj } from "@storybook/react-vite";
import { WasteSettingsSection } from "@/features/waste/components/waste-settings-section";
import { householdOverviewFixture } from "../../household/fixtures";
import { WASTE_TODAY, failedWasteSetupFixture, unconfiguredWasteSettingsFixture, wasteSettingsFixture } from "../fixtures";

const meta = {
  title: "Features/Waste/Components/WasteSettingsSection",
  component: WasteSettingsSection,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: {
    settings: wasteSettingsFixture,
    canManage: true,
    today: WASTE_TODAY,
    habitants: householdOverviewFixture.habitants,
    defaults: { street: "Kempische steenweg", number: "100", postalCode: "3500", municipality: "Hasselt" },
  },
} satisfies Meta<typeof WasteSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Connected to Limburg.net, synced this morning. */
export const Connected: Story = {};
export const NotConnected: Story = { args: { settings: unconfiguredWasteSettingsFixture } };
/** The last sync failed: the previous collections stay. */
export const SyncFailed: Story = { args: { settings: { ...wasteSettingsFixture, setup: failedWasteSetupFixture } } };
export const ReadOnly: Story = { args: { canManage: false } };
/** Bins tasks taking turns between two people, the morning of the collection. */
export const BinsTasksRotating: Story = {
  args: {
    settings: {
      ...wasteSettingsFixture,
      setup: wasteSettingsFixture.setup && {
        ...wasteSettingsFixture.setup,
        tasks: { enabled: true, timing: "morning_of", assigneeIds: householdOverviewFixture.habitants.slice(0, 2).map((habitant) => habitant.id), rotate: true },
      },
    },
  },
};
/** "Refresh now" waits for the collector: the button and the list show it. */
export const Refreshing: Story = { parameters: { router: { action: () => new Promise(() => undefined) } } };
