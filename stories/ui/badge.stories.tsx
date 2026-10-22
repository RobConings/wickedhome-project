import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@/components/ui/badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  args: { children: "Badge" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">Destructive</Badge>
    </div>
  ),
};

/** Status variants (docs/BRANDING.md): use these for every status, never ad-hoc colour classes. */
export const Status: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">Paid</Badge>
      <Badge variant="soon">Due soon</Badge>
      <Badge variant="danger">Overdue</Badge>
      <Badge variant="warning">On hold</Badge>
      <Badge variant="info">Waiting</Badge>
      <Badge variant="neutral">Upcoming</Badge>
      <Badge variant="highlight">3 new</Badge>
      <Badge variant="section">Active</Badge>
    </div>
  ),
};
