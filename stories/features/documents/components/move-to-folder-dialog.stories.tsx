import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { MoveToFolderDialog } from "@/features/documents/components/move-to-folder-dialog";
import { allDocumentFolders, documentFiles, documentFolders } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/MoveToFolderDialog",
  component: MoveToFolderDialog,
  args: { item: { kind: "file", file: documentFiles.akte }, folders: allDocumentFolders, onOpenChange: fn() },
} satisfies Meta<typeof MoveToFolderDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const File: Story = {};
export const FileInRoot: Story = { args: { item: { kind: "file", file: documentFiles.meterstand } } };
/** A folder can't be moved into itself: its own branch is left out. */
export const Folder: Story = { args: { item: { kind: "folder", folder: documentFolders.huis } } };
/** The folder tree is deferred by the loader: a skeleton until it arrives; "Move here" waits. */
export const Loading: Story = { args: { folders: undefined } };
export const LoadFailed: Story = { args: { folders: undefined, foldersFailed: true, onRetry: fn() } };
/** Moving to the drive root while the save is in flight: busy button, the tree and Cancel are locked. */
export const Saving: Story = {
  parameters: { router: { action: () => new Promise(() => {}) } },
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    const root = dialog.querySelector<HTMLLabelElement>("label");
    if (root) await userEvent.click(root);
    const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) await userEvent.click(submit);
  },
};
