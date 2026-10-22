import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DocumentsTrashScreen } from "@/features/documents/screens/documents-trash-screen";
import { documentTrash, documentUsage, neverResolves } from "../fixtures";

const meta = {
  title: "Features/Documents/Screens/DocumentsTrashScreen",
  component: DocumentsTrashScreen,
  parameters: { layout: "fullscreen" },
  args: { trash: documentTrash, usage: Promise.resolve(documentUsage), canManage: true },
} satisfies Meta<typeof DocumentsTrashScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { trash: { folders: [], files: [], totalBytes: 0 } } };
export const AsChild: Story = { args: { canManage: false } };
/** The storage usage is deferred by the loader: the meter shows a skeleton until it arrives. */
export const Loading: Story = { args: { usage: neverResolves() } };
/** Restoring the first item: its button spins, the other actions wait. */
export const Restoring: Story = {
  parameters: { router: { action: () => new Promise(() => {}) } },
  play: async ({ canvasElement }) => {
    const restore = canvasElement.querySelector<HTMLButtonElement>('[role="listitem"] button');
    if (restore) await userEvent.click(restore);
  },
};
/** Emptying the trash: the confirm dialog stays open with a busy button until it is done. */
export const Emptying: Story = {
  parameters: { router: { action: () => new Promise(() => {}) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("button")[0]!);
    const dialog = await within(document.body).findByRole("alertdialog");
    const buttons = within(dialog).getAllByRole("button");
    await userEvent.click(buttons[buttons.length - 1]!);
  },
};
