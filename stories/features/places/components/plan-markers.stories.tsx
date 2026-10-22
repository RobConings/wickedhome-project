import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppWindowIcon, ThermometerIcon } from "lucide-react";
import { PlanLegend, PlanMarkerDot, PlanMarkerPaletteItem, type PlanMarkerTone } from "@/features/places";
import { planLegendFixture, planMarkerPaletteFixture } from "../fixtures";

const TONES: PlanMarkerTone[] = ["success", "warning", "danger", "info", "neutral"];

/** The pieces of the generic marker layer outside the plan: dots, the legend and palette entries. */
function PlanMarkersDemo() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {TONES.map((tone) => (
          <PlanMarkerDot key={tone} tone={tone} />
        ))}
        <PlanMarkerDot tone="neutral" color="#c2508a" />
        <PlanMarkerDot tone="success" pulse />
      </div>
      <div className="flex items-center gap-4">
        {TONES.map((tone) => (
          <PlanMarkerDot key={tone} tone={tone} size="md" icon={tone === "info" ? ThermometerIcon : AppWindowIcon} />
        ))}
      </div>
      <PlanLegend title="Legend" items={planLegendFixture} className="rounded-xl border bg-popover p-3" />
      <ul className="flex flex-wrap gap-2">
        {planMarkerPaletteFixture.map((entry) => (
          <PlanMarkerPaletteItem key={entry.id} entry={entry} hint="Drag onto the plan" />
        ))}
      </ul>
      {/* With tap-to-place: "Place on the plan", then tap a spot (the second one is being placed). */}
      <ul className="flex flex-wrap gap-2">
        {planMarkerPaletteFixture.map((entry, index) => (
          <PlanMarkerPaletteItem
            key={entry.id}
            entry={entry}
            hint="Drag onto the plan, or use “Place on the plan” and tap a spot"
            onPlace={() => undefined}
            placing={index === 1}
            placeLabel="Place on the plan"
          />
        ))}
      </ul>
    </div>
  );
}

const meta = {
  title: "Features/Places/Components/PlanMarkers",
  component: PlanMarkersDemo,
} satisfies Meta<typeof PlanMarkersDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
