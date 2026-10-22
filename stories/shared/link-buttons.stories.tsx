import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoxIcon } from "lucide-react";
import { BackButton, BackLink, GhostLinkButton } from "@/components/shared/link-buttons";

const meta = {
  title: "Shared/LinkButtons",
  component: BackLink,
  parameters: { layout: "padded" },
  args: { to: "/tasks", children: "Tasks" },
} satisfies Meta<typeof BackLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In a `PageHeader` eyebrow. */
export const Eyebrow: Story = {};
export const Back: Story = { render: () => <BackButton to="/projects">Back</BackButton> };
/** A section's "go to …" footer. */
export const SectionFooter: Story = {
  render: () => (
    <GhostLinkButton to="/inventory" icon={BoxIcon} className="self-start text-muted-foreground">
      Stock
    </GhostLinkButton>
  ),
};
