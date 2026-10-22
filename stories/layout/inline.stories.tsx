import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inline } from "@/components/layout/inline";

function Box({ label, className = "h-24" }: { label: string; className?: string }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed border-primary/40 bg-accent/40 text-sm text-accent-foreground ${className}`}>
      {label}
    </div>
  );
}

const meta = {
  title: "Layout/Inline",
  component: Inline,
  argTypes: {
    gap: { control: "select", options: ["none", "xs", "sm", "md", "lg"] },
    justify: { control: "select", options: ["start", "center", "end", "between"] },
  },
  args: { gap: "sm" },
  render: (args) => (
    <Inline {...args} className="w-96">
      <Box label="A" className="h-12 w-20" />
      <Box label="B" className="h-12 w-20" />
      <Box label="C" className="h-12 w-20" />
    </Inline>
  ),
} satisfies Meta<typeof Inline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SpaceBetween: Story = { args: { justify: "between" } };
