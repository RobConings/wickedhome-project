import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentStorageBadge } from "@/features/documents/components/document-storage-badge";

const meta = {
  title: "Features/Documents/Components/DocumentStorageBadge",
  component: DocumentStorageBadge,
  parameters: { layout: "padded" },
  args: { file: { storageProvider: "google_drive", pendingStorageTarget: null } },
} satisfies Meta<typeof DocumentStorageBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Stored in Google Drive (a linked file, or a bill document saved to the household's Drive folder). */
export const InDrive: Story = {};
/** Should be in Drive, kept on the server until Drive is available again (a job retries). */
export const WaitingForDrive: Story = { args: { file: { storageProvider: "local", pendingStorageTarget: "bills" } } };
/** An ordinary file on the server: no badge. */
export const OnTheServer: Story = { args: { file: { storageProvider: "local", pendingStorageTarget: null } } };
