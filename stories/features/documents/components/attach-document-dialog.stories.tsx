import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { AttachDocumentDialog } from "@/features/documents/components/attach-document-dialog";
import { documentFiles, searchFilesFixture } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/AttachDocumentDialog",
  component: AttachDocumentDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onSelect: fn(),
    attachedIds: [documentFiles.luminus.id],
    search: searchFilesFixture,
  },
} satisfies Meta<typeof AttachDocumentDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const typeQuery = async () => {
  const dialog = await within(document.body).findByRole("dialog");
  await userEvent.type(within(dialog).getByRole("searchbox"), "factuur");
};

/** Type "factuur" or "garantie" to search the fixtures. */
export const Default: Story = {};
/** The search fails: a message with "Try again". */
export const SearchFails: Story = { args: { search: async () => Promise.reject(new Error("offline")) }, play: typeQuery };
/** The first search is still running: a spinner in the field and in the results area. */
export const Searching: Story = { args: { search: () => new Promise<never>(() => {}) }, play: typeQuery };
