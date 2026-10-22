import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DocumentTile } from "@/features/documents/components/document-tile";
import { fileItem, folderItem } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/DocumentTile",
  component: DocumentTile,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-52">
        <Story />
      </div>
    ),
  ],
  args: { item: fileItem, canManage: true, onAction: fn() },
} satisfies Meta<typeof DocumentTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DriveFile: Story = {};
export const DriveFolder: Story = { args: { item: folderItem } };
export const AsChild: Story = { args: { canManage: false } };
/** A bill document stored in Google Drive: Drive badge on the preview. */
export const StoredInGoogleDrive: Story = { args: { item: { kind: "file", file: { ...fileItem.file, storageProvider: "google_drive" } } } };
/** Kept on the server until Drive is available again. */
export const WaitingForDrive: Story = { args: { item: { kind: "file", file: { ...fileItem.file, pendingStorageTarget: "bills" } } } };
