import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NorthToolContext, OrientationSection } from "@/features/places/components/floor-plan-orientation-panel";
import { initPlanEditor, planEditorReducer, type PlanEditorState } from "@/features/places/components/floor-plan-state";
import type { FloorPlan } from "@/features/places/types/places";
import { groundFloorPlanFixture } from "../fixtures";
import { groundFloorWithUnderlayFixture, orientedPlanFixture, syntheticNorthArrowOnPlan } from "../plan-import-fixtures";

type Part = "orientation" | "north-tool";

/** The orientation parts of the tools window, on their own, at the panel's width. Try typing or the presets. */
function OrientationPanelDemo({ plan, part, initial }: { plan: FloorPlan; part: Part; initial?: Partial<PlanEditorState> }) {
  const [state, dispatch] = React.useReducer(planEditorReducer, plan, (value) => ({ ...initPlanEditor(value), ...initial }));
  return (
    <div className="flex w-80 flex-col gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-md">
      {part === "orientation" && <OrientationSection state={state} dispatch={dispatch} />}
      {part === "north-tool" && <NorthToolContext state={state} dispatch={dispatch} />}
      <p className="border-t pt-2 text-xs text-muted-foreground">
        north = {state.doc.north === null ? "null" : `${state.doc.north}°`} · tool = {state.tool}
      </p>
    </div>
  );
}

const meta = {
  title: "Features/Places/Components/FloorPlanOrientationPanel",
  component: OrientationPanelDemo,
  parameters: { layout: "centered" },
  args: { plan: groundFloorPlanFixture, part: "orientation" },
} satisfies Meta<typeof OrientationPanelDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** North not set yet. */
export const NotSet: Story = {};
/** North at 30° (from the architect's arrow): the top of the plan faces about north-west; no preset matches exactly. */
export const Set: Story = { args: { plan: orientedPlanFixture } };
/** North exactly up-left (315°): the top faces north-east, so the NE preset is pressed. */
export const Preset: Story = { args: { plan: { ...groundFloorPlanFixture, north: 315 } } };
/** The north tool, nothing clicked yet. */
export const NorthToolStart: Story = { args: { plan: groundFloorWithUnderlayFixture, part: "north-tool", initial: { tool: "north" } } };
/** The north tool after the tail and tip of the architect's arrow: 30°. */
export const NorthToolResult: Story = {
  args: {
    plan: groundFloorWithUnderlayFixture,
    part: "north-tool",
    initial: { tool: "north", northArrow: { a: syntheticNorthArrowOnPlan[0], b: syntheticNorthArrowOnPlan[1] } },
  },
};
/** Without an imported plan the tool still works along any line pointing north. */
export const NorthToolWithoutPlan: Story = { args: { part: "north-tool", initial: { tool: "north" } } };
