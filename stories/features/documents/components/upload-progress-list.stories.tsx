import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { UploadProgressList } from "@/features/documents/components/upload-progress-list";
import { documentUploads } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/UploadProgressList",
  component: UploadProgressList,
  decorators: [(Story) => <div className="w-[28rem] max-w-full">{Story()}</div>],
  args: { items: documentUploads, onCancel: fn(), onCancelAll: fn(), onClear: fn() },
} satisfies Meta<typeof UploadProgressList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Uploading 2 of 4…" with the overall bar and bytes, per-file bars, cancel per file and "Cancel all". */
export const InProgress: Story = {};
export const SingleFile: Story = { args: { items: [documentUploads[1]!] } };
export const Finished: Story = {
  args: {
    items: documentUploads.map((item) =>
      item.status === "error" ? item : { ...item, status: "done" as const, progress: 1 },
    ),
  },
};
export const Cancelled: Story = {
  args: { items: [{ ...documentUploads[2]!, status: "cancelled" as const }] },
};
