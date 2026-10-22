import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DocumentAttachments } from "@/features/documents/components/document-attachments";
import { AppliancesScreen } from "@/features/energy/screens/appliances-screen";
import { billAttachments, searchFilesFixture } from "../../documents/fixtures";
import { appliancesFixture, energyPlaceFixtures } from "../fixtures";

const meta = {
  title: "Features/Energy/Screens/AppliancesScreen",
  component: AppliancesScreen,
  parameters: { layout: "fullscreen", router: { initialEntries: ["/energy/appliances"] } },
  args: { appliances: appliancesFixture, places: energyPlaceFixtures, canManage: true },
} satisfies Meta<typeof AppliancesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { appliances: [] } };
export const AsChild: Story = { args: { canManage: false } };

/** Search looks in the name, category, place and notes. */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "gas");
  },
};
/** With the route's `documents` render prop: every row gets a paperclip that opens its manuals and warranties. */
export const WithDocuments: Story = {
  args: {
    documents: (appliance) => (
      <DocumentAttachments
        entityType="appliance"
        entityId={appliance.id}
        canManage
        initialFiles={billAttachments.slice(1)}
        searchFiles={searchFilesFixture}
        className="border-0 p-0 shadow-none"
      />
    ),
  },
};
