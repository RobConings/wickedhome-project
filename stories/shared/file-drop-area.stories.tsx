import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FileDropArea } from "@/components/shared/file-drop-zone";

const meta = {
  title: "Shared/FileDropArea",
  component: FileDropArea,
  args: {
    onFiles: fn(),
    overlayTitle: "Drop to upload to Facturen 2026",
    children: (
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {["Factuur Luminus september 2026.pdf", "Factuur Proximus september 2026.pdf", "Factuur De Watergroep Q3.pdf"].map(
          (name) => (
            <li key={name} className="px-4 py-3 text-sm">
              {name}
            </li>
          ),
        )}
        <li className="px-4 py-3 text-sm text-muted-foreground">Drag files from your desktop over this list.</li>
      </ul>
    ),
  },
} satisfies Meta<typeof FileDropArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
