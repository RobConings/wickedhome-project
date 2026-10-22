import type { Meta, StoryObj } from "@storybook/react-vite";
import { CenteredLayout } from "@/components/layout/centered-layout";

function Box({ label, className = "h-24" }: { label: string; className?: string }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed border-primary/40 bg-accent/40 text-sm text-accent-foreground ${className}`}>
      {label}
    </div>
  );
}

const meta = {
  title: "Layout/CenteredLayout",
  component: CenteredLayout,
  parameters: { layout: "fullscreen" },
  args: { children: <Box label="Login or setup card" className="h-80" /> },
} satisfies Meta<typeof CenteredLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
