import type { Meta, StoryObj } from "@storybook/react-vite";
import { ApplianceTile } from "@/features/energy/components/appliance-tile";
import { applianceFixtures, energyPlaceFixtures } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/ApplianceTile",
  component: ApplianceTile,
  // About as wide as a tile on a phone (two per row).
  decorators: [(Story) => <div className="flex w-44 flex-col *:flex-1">{Story()}</div>],
  args: { appliance: applianceFixtures.jacuzzi, places: energyPlaceFixtures, canManage: true },
} satisfies Meta<typeof ApplianceTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Measured: Story = {};
export const NotMeasured: Story = { args: { appliance: applianceFixtures.dishwasher } };
export const GasBoiler: Story = { args: { appliance: applianceFixtures.boiler } };
export const ReadOnly: Story = { args: { canManage: false } };
/** Documents only (a child): just the paperclip. */
export const WithDocumentsReadOnly: Story = { args: { canManage: false, documents: <p>Manual.pdf</p> } };
