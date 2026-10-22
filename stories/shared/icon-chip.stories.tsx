import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckIcon, FileTextIcon, ShieldCheckIcon, ShoppingCartIcon, ZapIcon } from "lucide-react";
import { IconChip } from "@/components/shared/icon-chip";
import { SECTION_ACCENTS } from "@/lib/section-accent";

const meta = {
  title: "Shared/IconChip",
  component: IconChip,
  args: { icon: CheckIcon, tone: "success" },
} satisfies Meta<typeof IconChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: "sm" } };

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <IconChip icon={CheckIcon} tone="success" />
      <IconChip icon={ShoppingCartIcon} tone="warning" />
      <IconChip icon={FileTextIcon} tone="info" />
      <IconChip icon={ShieldCheckIcon} tone="primary" />
      <IconChip icon={ZapIcon} tone="highlight" />
      <IconChip icon={ZapIcon} tone="danger" />
      <IconChip icon={ShieldCheckIcon} tone="neutral" />
      <IconChip icon={ShieldCheckIcon} tone="brand" />
    </div>
  ),
};

/** Named sections: the chip takes that section's accent (e.g. dashboard rows about tasks or shopping). */
export const Sections: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {SECTION_ACCENTS.map((accent) => (
        <IconChip key={accent} icon={ZapIcon} tone={accent} />
      ))}
    </div>
  ),
};
