import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileSpreadsheetIcon } from "lucide-react";
import { fn } from "storybook/test";
import { FileDropZone } from "@/components/shared/file-drop-zone";

const meta = {
  title: "Shared/FileDropZone",
  component: FileDropZone,
  decorators: [(Story) => <div className="w-[32rem] max-w-full">{Story()}</div>],
  args: {
    onFiles: fn(),
    accept: ".csv,text/csv",
    title: "Drop your file here",
    description: "Or choose one from your computer. Nothing is uploaded until you confirm.",
    buttonLabel: "Choose a file",
  },
} satisfies Meta<typeof FileDropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithIcon: Story = { args: { icon: FileSpreadsheetIcon } };
export const Disabled: Story = { args: { disabled: true } };
export const MultipleFiles: Story = {
  args: {
    accept: undefined,
    multiple: true,
    title: "This folder is empty",
    description: "Drop files here, or choose them from your device.",
    buttonLabel: "Choose files",
  },
};
export const Compact: Story = {
  args: {
    accept: undefined,
    multiple: true,
    compact: true,
    title: "Add a document",
    description: "Invoice, manual, warranty, quote… up to 100 MB.",
    buttonLabel: "Upload",
  },
};
