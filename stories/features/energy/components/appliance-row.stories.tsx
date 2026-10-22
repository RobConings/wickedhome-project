import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { DocumentAttachments } from "@/features/documents/components/document-attachments";
import { ApplianceRow } from "@/features/energy/components/appliance-row";
import { billAttachments, searchFilesFixture } from "../../documents/fixtures";
import { applianceFixtures, energyPlaceFixtures } from "../fixtures";

/** What the route renders in the `documents` slot (the documents feature's panel, without its card). */
const documentsPanel = (
  <DocumentAttachments
    entityType="appliance"
    entityId={applianceFixtures.jacuzzi.id}
    canManage
    initialFiles={billAttachments.slice(1)}
    searchFiles={searchFilesFixture}
    className="border-0 p-0 shadow-none"
  />
);

const meta = {
  title: "Features/Energy/Components/ApplianceRow",
  component: ApplianceRow,
  // Framed like a row of `GeneralList` (the list draws the padding and dividers).
  decorators: [(Story) => <div className="w-[36rem] max-w-full rounded-xl border bg-card px-4 py-2.5">{Story()}</div>],
  args: { appliance: applianceFixtures.jacuzzi, places: energyPlaceFixtures, canManage: true },
} satisfies Meta<typeof ApplianceRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Measured: Story = {};
export const NotMeasured: Story = { args: { appliance: applianceFixtures.dishwasher } };
export const NoPowerFigures: Story = { args: { appliance: { ...applianceFixtures.tools, ratedPowerW: null } } };
export const ReadOnly: Story = { args: { canManage: false } };
export const GasBoiler: Story = { args: { appliance: applianceFixtures.boiler } };
export const GasHob: Story = { args: { appliance: applianceFixtures.hob } };

/** With the route's `documents` slot: the paperclip opens the appliance's manuals and warranties. */
export const WithDocuments: Story = {
  args: { documents: documentsPanel },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Documents:/ }));
    await screen.findByRole("dialog");
  },
};
/** A child sees (and downloads) the documents, without edit or delete. */
export const WithDocumentsReadOnly: Story = { args: { canManage: false, documents: documentsPanel } };
