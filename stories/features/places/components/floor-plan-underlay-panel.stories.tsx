import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { initPlanEditor, planEditorReducer, type PlanEditorState } from "@/features/places/components/floor-plan-state";
import { AreaCheck, CalibrateToolContext, UnderlaySection } from "@/features/places/components/floor-plan-underlay-panel";
import type { FloorPlan } from "@/features/places/types/places";
import { firstFloorPlanFixture } from "../fixtures";
import { groundFloorWithUnderlayFixture, uncalibratedPlanFixture } from "../plan-import-fixtures";

type Part = "underlay" | "calibrate" | "area";

/** The underlay parts of the tools window, on their own, at the panel's width. */
function UnderlayPanelDemo({ plan, part, initial }: { plan: FloorPlan; part: Part; initial?: Partial<PlanEditorState> }) {
  const [state, dispatch] = React.useReducer(planEditorReducer, plan, (value) => ({ ...initPlanEditor(value), ...initial }));
  return (
    <div className="w-80 rounded-xl border bg-popover p-3 text-popover-foreground shadow-md">
      {part === "underlay" && <UnderlaySection state={state} dispatch={dispatch} onImport={fn()} onRecrop={fn()} />}
      {part === "calibrate" && <CalibrateToolContext state={state} dispatch={dispatch} />}
      {part === "area" && (
        <div className="flex flex-col gap-2">
          <AreaCheck areaM2={17.32} planAreaM2={17.32} />
          <AreaCheck areaM2={10.89} planAreaM2={11.6} />
          <AreaCheck areaM2={24.94} planAreaM2={null} />
        </div>
      )}
    </div>
  );
}

const meta = {
  title: "Features/Places/Components/FloorPlanUnderlayPanel",
  component: UnderlayPanelDemo,
  parameters: { layout: "centered" },
  args: { plan: groundFloorWithUnderlayFixture, part: "underlay" },
} satisfies Meta<typeof UnderlayPanelDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No plan yet: one button to import. */
export const NoUnderlay: Story = { args: { plan: firstFloorPlanFixture } };
/** Imported and calibrated at 1:50, locked, four room labels found. */
export const Calibrated: Story = {};
/** Just imported: the scale still has to be set (highlighted). */
export const NotCalibrated: Story = { args: { plan: uncalibratedPlanFixture } };

/** Calibrate tool before any click. */
export const CalibrateStart: Story = { args: { plan: uncalibratedPlanFixture, part: "calibrate", initial: { tool: "calibrate" } } };
/** A measuring line along the top wall: type its real length, or pick the drawing scale. */
export const CalibrateLine: Story = {
  args: {
    plan: uncalibratedPlanFixture,
    part: "calibrate",
    initial: { tool: "calibrate", calibration: { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } } },
  },
};
/** Drawn area vs the architect's: matching, more than 3 % off, and no label. */
export const AreaChecks: Story = { args: { part: "area" } };
