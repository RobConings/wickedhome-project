import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TrashListItem } from "@/features/documents/components/trash-list-item";
import { trashedFileItem, trashedFolderItem } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/TrashListItem",
  component: TrashListItem,
  parameters: { layout: "padded" },
  args: { item: trashedFileItem, canManage: true, onRestore: fn(), onDelete: fn() },
} satisfies Meta<typeof TrashListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TrashedFile: Story = {};
export const TrashedFolder: Story = { args: { item: trashedFolderItem } };
export const AsChild: Story = { args: { canManage: false } };
/** Restoring this item: its button spins and the row fades; the other actions wait. */
export const Restoring: Story = { args: { busy: { intent: "restore", id: trashedFileItem.file.id } } };
export const Deleting: Story = { args: { item: trashedFolderItem, busy: { intent: "delete", id: trashedFolderItem.folder.id } } };
/** Emptying the whole trash: every item fades, nothing can be clicked. */
export const Emptying: Story = { args: { busy: { intent: "empty-trash" } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
