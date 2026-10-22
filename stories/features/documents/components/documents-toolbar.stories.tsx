import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DocumentsToolbar } from "@/features/documents/components/documents-toolbar";

const meta = {
  title: "Features/Documents/Components/DocumentsToolbar",
  component: DocumentsToolbar,
  parameters: { layout: "padded" },
  args: {
    sort: { key: "name", direction: "asc" },
    onSortChange: fn(),
  },
} satisfies Meta<typeof DocumentsToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const BySize: Story = { args: { sort: { key: "size", direction: "desc" } } };
/** On phones only the sort icon shows. */
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
