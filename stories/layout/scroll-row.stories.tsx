import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollRow } from "@/components/layout/scroll-row";
import { cn } from "@/lib/utils";

const chipClass =
  "inline-flex h-8 items-center rounded-full border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

const LABELS = ["All", "Supermarket", "DIY store", "Garden centre", "Pharmacy", "Bakery", "Butcher", "Online", "Other"];

function Chips() {
  const [active, setActive] = React.useState("All");
  return (
    <>
      {LABELS.map((label) => (
        <button
          key={label}
          type="button"
          aria-pressed={active === label}
          onClick={() => setActive(label)}
          className={cn(chipClass, active === label ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
        >
          {label}
        </button>
      ))}
    </>
  );
}

const meta = {
  title: "Layout/ScrollRow",
  component: ScrollRow,
  parameters: { layout: "padded" },
  args: { label: "Shop type", focusable: false },
  render: (args) => (
    <div className="max-w-sm rounded-lg border border-dashed p-3">
      <ScrollRow {...args}>
        <Chips />
      </ScrollRow>
    </div>
  ),
} satisfies Meta<typeof ScrollRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Filter chips (buttons): the row scrolls inside its box, snaps, and fades the edge with more chips. */
export const FilterChips: Story = {};

/** Legend chips that are not focusable themselves: the row becomes a tab stop and scrolls with ← →. */
export const Legend: Story = {
  args: { label: "Legend", focusable: true },
  render: (args) => (
    <div className="max-w-xs rounded-lg border border-dashed p-3">
      <ScrollRow {...args}>
        {["Electricity", "Gas", "Solar", "Battery", "Export", "Heat pump"].map((label) => (
          <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
            <span className="size-2 rounded-full bg-section" aria-hidden="true" />
            {label}
          </span>
        ))}
      </ScrollRow>
    </div>
  ),
};

/** Scrolls on phones only; from `sm` up the chips wrap onto more lines. */
export const WrapFromSm: Story = { args: { wrapFrom: "sm" } };

/** The page never scrolls sideways: only the row does. */
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
