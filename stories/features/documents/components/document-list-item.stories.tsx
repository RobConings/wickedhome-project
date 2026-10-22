import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DocumentListItem } from "@/features/documents/components/document-list-item";
import { fileItem, folderItem, searchFileItem } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/DocumentListItem",
  component: DocumentListItem,
  parameters: { layout: "padded" },
  args: { item: fileItem, canManage: true, onAction: fn() },
} satisfies Meta<typeof DocumentListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DriveFile: Story = {};
export const DriveFolder: Story = { args: { item: folderItem } };
/** A search result: the folder it is in comes first. */
export const SearchResult: Story = { args: { item: searchFileItem, showPath: true } };
export const AsChild: Story = { args: { canManage: false } };
/** A bill document stored in Google Drive (the household saves bills there): Drive badge. */
export const StoredInGoogleDrive: Story = {
  args: { item: { kind: "file", file: { ...fileItem.file, name: "Factuur Luminus september 2026.pdf", storageProvider: "google_drive" } } },
};
/** Drive was unavailable at upload: kept on the server and marked "Waiting for Drive" until the job moves it. */
export const WaitingForDrive: Story = {
  args: { item: { kind: "file", file: { ...fileItem.file, name: "Factuur Fluvius oktober 2026.pdf", pendingStorageTarget: "bills" } } },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
