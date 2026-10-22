import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloorPlanView, PlanLegend } from "@/features/places";
import { groundFloorPlanFixture, outsidePlanFixture, planLegendFixture, planMarkerFixtures } from "../fixtures";
import { groundFloorWithUnderlayFixture, orientedPlanFixture, storySunMoment, syntheticUnderlayUrl } from "../plan-import-fixtures";

const meta = {
  title: "Features/Places/Components/FloorPlanView",
  component: FloorPlanView,
  parameters: { layout: "padded" },
  args: { plan: groundFloorPlanFixture, className: "h-[560px]" },
} satisfies Meta<typeof FloorPlanView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Read-only plan without markers: pan, zoom and tap places. */
export const Plain: Story = {};

/** Generic markers with a legend; tap a marker to select it. */
export const WithMarkers: Story = {
  render: function Render(args) {
    const [selected, setSelected] = React.useState<string | null>("m-thermostat");
    return (
      <FloorPlanView
        {...args}
        markers={planMarkerFixtures}
        selectedMarkerId={selected}
        onMarkerClick={setSelected}
        legend={<PlanLegend title="Legend" items={planLegendFixture} />}
      />
    );
  },
};

export const Outside: Story = { args: { plan: outsidePlanFixture } };

/** With an imported architect's plan: off by default, the button top left shows it under rooms and markers. */
export const WithUnderlay: Story = {
  args: { plan: groundFloorWithUnderlayFixture, underlayUrl: syntheticUnderlayUrl, markers: planMarkerFixtures },
  globals: { viewport: { value: "mobile1" } },
};

/**
 * North is known (30°): a compass top right, and "North up" turns the whole plan so north points up, with
 * labels and markers kept upright (remembered per device). "Sun" shows today's sun over the plan.
 */
export const WithCompass: Story = {
  args: { plan: orientedPlanFixture, underlayUrl: syntheticUnderlayUrl, markers: planMarkerFixtures, now: storySunMoment },
};

/** The sun on a summer afternoon: light from the south-west, a time slider for today. Press "Sun". */
export const Sun: Story = {
  args: { plan: orientedPlanFixture, underlayUrl: syntheticUnderlayUrl, now: storySunMoment },
  play: async ({ canvasElement }) => {
    const button = [...canvasElement.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((candidate) =>
      /sun|zon/i.test(candidate.textContent ?? ""),
    );
    if (button?.getAttribute("aria-pressed") === "false") button.click();
  },
};

/** On a phone: the toggles wrap, the sun panel takes the full width, the compass stays top right. */
export const SunMobile: Story = {
  ...Sun,
  globals: { viewport: { value: "mobile1" } },
};
