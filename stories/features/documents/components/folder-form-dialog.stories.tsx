import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { FolderFormDialog } from "@/features/documents/components/folder-form-dialog";
import { documentFolders } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/FolderFormDialog",
  component: FolderFormDialog,
  args: { open: true, onOpenChange: fn(), parentId: null },
} satisfies Meta<typeof FolderFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = { args: { folder: documentFolders.verzekeringen } };
export const NameTaken: Story = {
  parameters: {
    router: { action: async () => ({ formError: "There's already a folder with that name here.", intent: "create-folder" }) },
  },
};
/** Saving: the dialog stays open with a busy button and locked fields until the action is done. */
export const Saving: Story = {
  args: { folder: documentFolders.verzekeringen },
  parameters: { router: { action: () => new Promise(() => {}) } },
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) await userEvent.click(submit);
  },
};
