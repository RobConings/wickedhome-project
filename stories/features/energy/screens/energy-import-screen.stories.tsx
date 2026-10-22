import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyImportScreen } from "@/features/energy/screens/energy-import-screen";
import {
  TODAY,
  appliancesFixture,
  dataOverviewFixture,
  emptyDataOverviewFixture,
  fluviusGasPreviewFixture,
  fluviusPreviewFixture,
  gasSettingsFixture,
} from "../fixtures";

const meta = {
  title: "Features/Energy/Screens/EnergyImportScreen",
  component: EnergyImportScreen,
  parameters: { layout: "fullscreen", router: { initialEntries: ["/energy/import"] } },
  args: {
    data: dataOverviewFixture,
    appliances: appliancesFixture,
    settings: gasSettingsFixture,
    now: { date: TODAY, time: "08:30" },
    canManage: true,
    upload: async (parsed) => {
      const total = parsed.intervals.length;
      return { received: total, upserted: total, inserted: total, updated: 0, batches: 1, batchesDone: 1, stopped: false };
    },
  },
} satisfies Meta<typeof EnergyImportScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithPreview: Story = { args: { initialImportState: { step: "preview", preview: fluviusPreviewFixture } } };
export const FirstTime: Story = { args: { data: emptyDataOverviewFixture } };
export const AsChild: Story = { args: { canManage: false } };
export const WithGasPreview: Story = {
  args: { initialImportState: { step: "preview", preview: fluviusGasPreviewFixture } },
};
/** Loading: saving batch 3 of 12 while the rest of the page stays usable. */
export const Saving: Story = {
  args: {
    initialImportState: {
      step: "uploading",
      preview: fluviusPreviewFixture,
      progress: { batch: 2, batches: 12, done: 4000, total: 24_000 },
      stopping: false,
    },
  },
};
