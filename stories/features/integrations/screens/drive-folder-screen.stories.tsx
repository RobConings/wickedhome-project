import type { Meta, StoryObj } from "@storybook/react-vite";
import { DriveFolderScreen } from "@/features/integrations/screens/drive-folder-screen";
import { connectedGoogleFixture, driveListingFixture, fakeGoogleClient } from "../fixtures";

const meta = {
  title: "Features/Integrations/Screens/DriveFolderScreen",
  component: DriveFolderScreen,
  args: { linkId: "l1", listing: driveListingFixture, canManage: true, client: fakeGoogleClient(connectedGoogleFixture) },
} satisfies Meta<typeof DriveFolderScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A linked Drive folder: a sub-folder, files (open, download, import a copy, keep in Drive), a Google Sheet (exported as PDF) and a Form (Drive only). */
export const DriveFolder: Story = {};

/** Inside a sub-folder, linked by someone else (no Unlink). */
export const SubFolder: Story = {
  args: {
    listing: {
      ...driveListingFixture,
      link: { ...driveListingFixture.link, mine: false, ownerName: "Clara" },
      breadcrumbs: [{ id: "a", name: "Verbouwing" }],
      folderId: "a",
      items: driveListingFixture.items.slice(1, 3),
    },
  },
};

export const Empty: Story = { args: { listing: { ...driveListingFixture, items: [] } } };
export const ReadOnly: Story = { args: { canManage: false } };
export const Failed: Story = { args: { listing: null } };
export const Loading: Story = { args: { listing: new Promise(() => undefined) } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
