import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { initPlanEditor, planEditorReducer, type PlanEditorState } from "@/features/places/components/floor-plan-state";
import { FloorPlanToolsPanel } from "@/features/places/components/floor-plan-tools-panel";
import type { FloorPlan } from "@/features/places/types/places";
import { firstFloorPlanFixture, groundFloorPlanFixture } from "../fixtures";
import {
  groundFloorWithUnderlayFixture,
  livingAreaM2,
  orientedPlanFixture,
  syntheticNorthArrowOnPlan,
  tracedWallsPlanFixture,
  uncalibratedPlanFixture,
} from "../plan-import-fixtures";

/** The tools window over an empty board, showing what it offers per tool and per selection. */
function PanelDemo({ plan, initial }: { plan: FloorPlan; initial?: Partial<PlanEditorState> }) {
  const [state, dispatch] = React.useReducer(planEditorReducer, plan, (value) => ({ ...initPlanEditor(value), ...initial }));
  return (
    <div className="relative h-[560px] overflow-hidden rounded-xl border bg-card">
      <FloorPlanToolsPanel
        state={state}
        dispatch={dispatch}
        floorKind={plan.floor.kind}
        onCompleteOutline={() => dispatch({ type: "completeOutline", newPlace: { key: "new-1", name: "Room", color: "#3b82b6" } })}
        placeHref={(id) => `/places/${id}`}
        onImport={fn()}
        onRecrop={fn()}
      />
    </div>
  );
}

const meta = {
  title: "Features/Places/Components/FloorPlanToolsPanel",
  component: PanelDemo,
  parameters: { layout: "padded" },
  args: { plan: groundFloorPlanFixture },
} satisfies Meta<typeof PanelDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NothingSelected: Story = { args: { plan: { ...groundFloorPlanFixture } } };
export const UnplacedRooms: Story = { args: { plan: firstFloorPlanFixture } };
export const PlaceSelected: Story = { args: { initial: { selection: { type: "place", key: "p-office", vertex: 3 } } } };
export const WallSelected: Story = { args: { initial: { selection: { type: "element", id: "w-middle" } } } };
export const DoorSelected: Story = { args: { initial: { selection: { type: "element", id: "d-front" } } } };
export const DrawingOutline: Story = {
  args: {
    initial: {
      tool: "outline",
      draft: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
    },
  },
};
export const DrawingWalls: Story = { args: { initial: { tool: "wall" } } };
/** Tracing: 34 cm walls drawn along their left face (the architect's line). */
export const DrawingWallsAlongAFace: Story = { args: { initial: { tool: "wall", wallThickness: 34, wallAlignment: "left" } } };
export const PlacingDoors: Story = { args: { initial: { tool: "door" } } };

/** With an imported, calibrated plan: its controls sit under the tool's context. */
export const WithUnderlay: Story = { args: { plan: groundFloorWithUnderlayFixture } };
/** Calibrating a freshly imported plan with a measuring line. */
export const Calibrating: Story = {
  args: { plan: uncalibratedPlanFixture, initial: { tool: "calibrate", calibration: { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } } } },
};

/** Fill room, before a click. */
export const FillRoom: Story = { args: { plan: tracedWallsPlanFixture, initial: { tool: "fill" } } };
/** Fill room after a click: named from the PDF label, the area matches the architect's. */
export const FillRoomFilled: Story = {
  args: {
    plan: {
      ...tracedWallsPlanFixture,
      places: [{ ...groundFloorPlanFixture.places[0]!, id: "p-living", name: "Living", polygon: null, areaM2: null }],
    },
    initial: {
      tool: "fill",
      fillFeedback: { type: "filled", key: "p-living", areaM2: livingAreaM2, planAreaM2: 24.94, reused: true },
    },
  },
};
/** Fill room in an area that isn't closed: the open wall ends are marked on the plan. */
export const FillRoomOpen: Story = {
  args: {
    plan: tracedWallsPlanFixture,
    initial: {
      tool: "fill",
      fillFeedback: {
        type: "open",
        gaps: [
          { x: 0, y: 0 },
          { x: 0, y: 300 },
        ],
      },
    },
  },
};

/** Orientation, north not set yet: degrees, "the top of the plan faces" presets, and "Point north on the plan". */
export const OrientationNotSet: Story = { args: { plan: groundFloorWithUnderlayFixture } };
/** North set to 30° (from the architect's arrow): the top of the plan faces north-west. */
export const OrientationSet: Story = { args: { plan: orientedPlanFixture } };
/** The north tool after clicking the tail and tip of the architect's north arrow: 30°, ready to use. */
export const PointingNorth: Story = {
  args: {
    plan: groundFloorWithUnderlayFixture,
    initial: { tool: "north", northArrow: { a: syntheticNorthArrowOnPlan[0], b: syntheticNorthArrowOnPlan[1] } },
  },
};
/** The north tool waiting for the arrow's tip. */
export const PointingNorthTip: Story = {
  args: { plan: groundFloorWithUnderlayFixture, initial: { tool: "north", northArrow: { a: syntheticNorthArrowOnPlan[0], b: null } } },
};
