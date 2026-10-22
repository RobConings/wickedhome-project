import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentAttachments } from "@/features/documents/components/document-attachments";
import { billAttachments, documentUploads, searchFilesFixture } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/DocumentAttachments",
  component: DocumentAttachments,
  decorators: [(Story) => <div className="w-[26rem] max-w-full">{Story()}</div>],
  args: {
    entityType: "bill",
    entityId: "b-luminus-2026-09",
    canManage: true,
    initialFiles: billAttachments,
    searchFiles: searchFilesFixture,
  },
} satisfies Meta<typeof DocumentAttachments>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { initialFiles: [] } };
export const Uploading: Story = { args: { initialUploads: documentUploads.slice(1, 3) } };
export const AsChild: Story = { args: { canManage: false } };
export const ApplianceManuals: Story = {
  args: { entityType: "appliance", entityId: "a-wasmachine", title: "Manuals & warranty", initialFiles: billAttachments.slice(1) },
};
/** The first load failed: an error with "Try again" instead of an endless skeleton. */
export const LoadFails: Story = {
  args: { initialFiles: undefined, loadFiles: async () => Promise.reject(new Error("offline")) },
};
/** A note after a file's size and date, composed by the route (here: the PDF came from a mail bill). */
export const WithFileNote: Story = {
  args: { fileNote: (file) => (file.id === billAttachments[0]?.id ? "From mail on 02/10/2026" : null) },
};
/** Loading its own data: a skeleton shaped like the rows until the first answer. */
export const Loading: Story = { args: { initialFiles: undefined, loadFiles: () => new Promise(() => {}) } };
