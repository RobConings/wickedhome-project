import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TrashTile } from "@/features/documents/components/trash-tile";
import { trashedFileItem, trashedFolderItem } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/TrashTile",
  component: TrashTile,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-52">
        <Story />
      </div>
    ),
  ],
  args: { item: trashedFileItem, canManage: true, onRestore: fn(), onDelete: fn() },
} satisfies Meta<typeof TrashTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TrashedFile: Story = {};
export const TrashedFolder: Story = { args: { item: trashedFolderItem } };
export const AsChild: Story = { args: { canManage: false } };
/** Restoring this item: its button spins and the tile fades; the other actions wait. */
export const Restoring: Story = { args: { busy: { intent: "restore", id: trashedFileItem.file.id } } };
export const Deleting: Story = { args: { item: trashedFolderItem, busy: { intent: "delete", id: trashedFolderItem.folder.id } } };
