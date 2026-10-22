import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderGlyph } from "@/features/documents/components/folder-glyph";

const meta = {
  title: "Features/Documents/Components/FolderGlyph",
  component: FolderGlyph,
  args: { size: "lg" },
} satisfies Meta<typeof FolderGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Coloured: Story = { args: { color: "#e34948" } };
export const Palette: Story = {
  render: () => (
    <div className="flex gap-3">
      {[null, "#2a78d6", "#eda100", "#1baf7a", "#e87ba4", "#64748b"].map((color) => (
        <FolderGlyph key={color ?? "default"} color={color} size="lg" />
      ))}
    </div>
  ),
};
