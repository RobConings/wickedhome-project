import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { FileRenameDialog } from "@/features/documents/components/file-rename-dialog";
import { documentFiles } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/FileRenameDialog",
  component: FileRenameDialog,
  args: { file: documentFiles.plans, onOpenChange: fn() },
} satisfies Meta<typeof FileRenameDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const InvalidName: Story = {
  parameters: {
    router: { action: async () => ({ errors: { name: ["No slashes or control characters"] }, intent: "rename-file" }) },
  },
};
/** Saving: the dialog stays open with a busy button and a locked field until the action is done. */
export const Saving: Story = {
  parameters: { router: { action: () => new Promise(() => {}) } },
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) await userEvent.click(submit);
  },
};
