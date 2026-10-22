import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloorPlanCanvas } from "@/features/places/components/floor-plan-canvas";
import { initPlanEditor, planEditorReducer, type PlanTool } from "@/features/places/components/floor-plan-state";
import type { FloorPlan } from "@/features/places/types/places";
import { groundFloorPlanFixture, outsidePlanFixture } from "../fixtures";

/** The canvas alone, with editor state but no tools window: try dragging shapes, wheel zoom and panning. */
function CanvasDemo({
  plan,
  tool = "select",
  readOnly = false,
  rotation,
  sun,
}: {
  plan: FloorPlan;
  tool?: PlanTool;
  readOnly?: boolean;
  rotation?: number;
  sun?: { azimuth: number; elevation: number } | null;
}) {
  const [state, dispatch] = React.useReducer(planEditorReducer, plan, (initial) => ({ ...initPlanEditor(initial), tool }));
  return (
    <FloorPlanCanvas
      state={state}
      dispatch={dispatch}
      readOnly={readOnly}
      rotation={rotation}
      sun={sun}
      onCompleteOutline={() => dispatch({ type: "completeOutline", newPlace: { key: "new-1", name: "Room", color: "#3b82b6" } })}
      className="h-[560px]"
    />
  );
}

const meta = {
  title: "Features/Places/Components/FloorPlanCanvas",
  component: CanvasDemo,
  parameters: { layout: "padded" },
  args: { plan: groundFloorPlanFixture },
} satisfies Meta<typeof CanvasDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroundFloor: Story = {};
export const Outside: Story = { args: { plan: outsidePlanFixture } };
export const DrawOutline: Story = { args: { tool: "outline" } };
export const ReadOnly: Story = { args: { readOnly: true } };
/** Editing with north set: the compass bottom right is a dial (drag it or use the arrow keys). */
export const CompassDial: Story = { args: { plan: { ...groundFloorPlanFixture, north: 30 } } };
/** North not set yet: the dial shows "?" until dragged. */
export const CompassNotSet: Story = {};
/** Read-only, turned so north is up (north was 30°): labels and the compass stay upright, the grid turns along. */
export const NorthUp: Story = { args: { plan: { ...groundFloorPlanFixture, north: 30 }, readOnly: true, rotation: -30 } };
/** Read-only with the sun in the south-west, 35° high: light comes in from that side, a sun dot on the compass. */
export const SunLight: Story = { args: { plan: { ...groundFloorPlanFixture, north: 30 }, readOnly: true, sun: { azimuth: 235, elevation: 35 } } };
