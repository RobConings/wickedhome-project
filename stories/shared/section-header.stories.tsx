import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/shared/section-header";

const meta = {
  title: "Shared/SectionHeader",
  component: SectionHeader,
  parameters: { layout: "padded" },
  args: { title: "Section title", description: "What this section contains." },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  args: {
    actions: (
      <Button variant="ghost" size="sm">
        View all
      </Button>
    ),
  },
};
