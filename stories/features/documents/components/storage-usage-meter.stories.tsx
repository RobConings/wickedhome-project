import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StorageUsageMeter } from "@/features/documents/components/storage-usage-meter";
import { documentUsage } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/StorageUsageMeter",
  component: StorageUsageMeter,
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
  args: { usage: documentUsage },
} satisfies Meta<typeof StorageUsageMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LowDiskSpace: Story = { args: { usage: { ...documentUsage, diskFreeBytes: 21 * 1000 * 1000 * 1000 } } };
export const DiskUnknown: Story = {
  args: { usage: { ...documentUsage, diskTotalBytes: null, diskFreeBytes: null, trashBytes: 0 } },
};
export const Empty: Story = { args: { usage: { ...documentUsage, usedBytes: 0, fileCount: 0, trashBytes: 0 } } };
/** The usage is deferred by the loader: a skeleton of the same size until it arrives. */
export const Loading: Story = { args: { usage: undefined } };
export const Failed: Story = { args: { usage: undefined, failed: true, onRetry: fn() } };
