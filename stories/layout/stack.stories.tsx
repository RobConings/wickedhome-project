import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@/components/layout/stack";

function Box({ label, className = "h-24" }: { label: string; className?: string }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed border-primary/40 bg-accent/40 text-sm text-accent-foreground ${className}`}>
      {label}
    </div>
  );
}

const meta = {
  title: "Layout/Stack",
  component: Stack,
  argTypes: { gap: { control: "select", options: ["none", "xs", "sm", "md", "lg", "xl"] } },
  args: { gap: "md" },
  render: (args) => (
    <Stack {...args} className="w-64">
      <Box label="One" className="h-12" />
      <Box label="Two" className="h-12" />
      <Box label="Three" className="h-12" />
    </Stack>
  ),
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Tight: Story = { args: { gap: "xs" } };
export const Loose: Story = { args: { gap: "xl" } };
