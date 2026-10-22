import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlanCompass } from "@/features/places/components/plan-compass";

const meta = {
  title: "Features/Places/Components/PlanCompass",
  component: PlanCompass,
  parameters: { layout: "centered" },
  args: { north: 30 },
} satisfies Meta<typeof PlanCompass>;

export default meta;
type Story = StoryObj<typeof meta>;

/** North 30° clockwise from the top of the plan: N, E, S and W where they are on the plan. */
export const Rose: Story = {};
/** The plan is shown north up (turned by −north): the rose is upright again. */
export const NorthUp: Story = { args: { viewRotation: -30 } };
/** Small, for thumbnails and the import dialog: only the N. */
export const Small: Story = { args: { size: "sm" } };
/** Not set: a question mark. */
export const NotSet: Story = { args: { north: null } };
/** With the sun (south-west, above the horizon) as a dot on the ring. */
export const WithSun: Story = { args: { sun: { azimuth: 235, elevation: 35 } } };

/** As a dial: drag it round (Shift: 15° steps) or focus it and use the arrow keys, Page Up/Down, Home. */
export const Dial: Story = {
  render: function Render(args) {
    const [north, setNorth] = React.useState<number | null>(args.north);
    return (
      <div className="flex flex-col items-center gap-3">
        <PlanCompass {...args} north={north} onChange={(value) => setNorth(value)} />
        <span className="text-sm tabular-nums text-muted-foreground">{north === null ? "—" : `${north}°`}</span>
      </div>
    );
  },
};
