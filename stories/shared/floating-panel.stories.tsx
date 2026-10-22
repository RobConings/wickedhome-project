import type { Meta, StoryObj } from "@storybook/react-vite";
import { MousePointer2Icon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/shared/floating-panel";

const meta = {
  title: "Shared/FloatingPanel",
  component: FloatingPanel,
  parameters: { layout: "fullscreen" },
  args: {
    label: "Tools",
    moveLabel: "Move the panel",
    resetLabel: "Put the panel back",
    compactLabel: "Make the panel smaller",
    expandLabel: "Show labels",
    children: null,
  },
  decorators: [
    (Story) => (
      <div className="p-4">
        {/* The panel floats inside the nearest `relative` container. */}
        <div className="relative h-[480px] overflow-hidden rounded-xl border bg-card">
          <p className="p-4 text-sm text-muted-foreground">Drag the grip to move the panel; it stays inside this box.</p>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof FloatingPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const content = (compact: boolean) => (
  <>
    <div className="flex flex-col gap-1">
      <p className={compact ? "sr-only" : "text-sm font-semibold"}>Selection</p>
      <p className={compact ? "sr-only" : "text-xs text-muted-foreground"}>Content can hide its text when compact.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {[
        { icon: MousePointer2Icon, label: "Select" },
        { icon: PencilIcon, label: "Edit" },
        { icon: Trash2Icon, label: "Delete" },
      ].map(({ icon: Icon, label }) => (
        <Button key={label} size="sm" variant="secondary" title={label}>
          <Icon />
          <span className={compact ? "sr-only" : undefined}>{label}</span>
        </Button>
      ))}
    </div>
  </>
);

export const Default: Story = { args: { children: content } };
export const Compact: Story = { args: { children: content, defaultCompact: true } };
