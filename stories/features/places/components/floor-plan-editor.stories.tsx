import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fireEvent, waitFor } from "storybook/test";
import { FloorPlanEditor } from "@/features/places/components/floor-plan-editor";
import { PlanMarkerPaletteItem, type PlanMarker } from "@/features/places";
import {
  firstFloorPlanFixture,
  groundFloorPlanFixture,
  outsidePlanFixture,
  planMarkerFixtures,
  planMarkerPaletteFixture,
} from "../fixtures";
import {
  groundFloorWithUnderlayFixture,
  orientedPlanFixture,
  syntheticNorthArrowOnPlan,
  syntheticUnderlayUrl,
  tracedWallsPlanFixture,
  uncalibratedPlanFixture,
} from "../plan-import-fixtures";

const meta = {
  title: "Features/Places/Components/FloorPlanEditor",
  component: FloorPlanEditor,
  parameters: { layout: "fullscreen" },
  args: { plan: groundFloorPlanFixture, canManage: true, className: "h-full" },
  decorators: [
    (Story) => (
      <div className="h-[760px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FloorPlanEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A 10 × 8 m ground floor with rooms, walls, doors and windows. Saving succeeds in Storybook. */
export const SampleHouse: Story = {};
export const Outside: Story = { args: { plan: outsidePlanFixture } };
/** Nothing drawn yet: the rooms wait in the tools window. */
export const EmptyPlan: Story = { args: { plan: firstFloorPlanFixture } };
export const ReadOnly: Story = { args: { canManage: false } };
export const SaveFails: Story = {
  parameters: { router: { action: async () => ({ formError: "The plan couldn't be saved. Check it and try again." }) } },
};

/** Scripted: draws a room with four clicks, closes it with Enter, then draws a two-segment wall. */
export const DrawingARoom: Story = {
  args: { plan: firstFloorPlanFixture },
  play: async ({ canvasElement }) => {
    const svg = await waitFor(() => {
      const element = canvasElement.querySelector<SVGSVGElement>("svg[role=application]");
      if (!element?.getBoundingClientRect().width) throw new Error("Canvas not ready");
      return element;
    });
    const rect = svg.getBoundingClientRect();
    const click = (x: number, y: number) => {
      const position = { clientX: rect.left + x, clientY: rect.top + y, pointerId: 1, button: 0, pointerType: "mouse", bubbles: true };
      fireEvent.pointerDown(svg, position);
      fireEvent.pointerUp(svg, position);
    };
    const press = (key: string) => fireEvent.keyDown(window, { key });

    press("r");
    for (const [x, y] of [
      [160, 120],
      [520, 120],
      [520, 400],
      [160, 400],
    ] as const) {
      click(x, y);
    }
    press("Enter");
    press("w");
    click(160, 470);
    click(520, 470);
    click(520, 560);
    press("Escape");
  },
};

/** Scripted: draws a room, then saves (Ctrl+S) with a save that never finishes: spinner, busy button, frozen plan. */
export const Saving: Story = {
  args: { plan: firstFloorPlanFixture },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async (context) => {
    await DrawingARoom.play?.(context);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  },
};

/** Scripted: draws a room, then the save is refused: "Not saved" next to an enabled Save button. */
export const SaveFailed: Story = {
  args: { plan: firstFloorPlanFixture },
  parameters: SaveFails.parameters,
  play: async (context) => {
    await DrawingARoom.play?.(context);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  },
};

/** Scripted: selects the kitchen, drags one of its corners outwards, then moves the toilet's door. */
export const EditingShapes: Story = {
  play: async ({ canvasElement }) => {
    const svg = await waitFor(() => {
      const element = canvasElement.querySelector<SVGSVGElement>("svg[role=application]");
      if (!element?.getBoundingClientRect().width) throw new Error("Canvas not ready");
      return element;
    });
    const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: "mouse", bubbles: true });
    const drag = (target: Element, to: { x: number; y: number }) => {
      const box = target.getBoundingClientRect();
      const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      fireEvent.pointerDown(target, pointer(from.x, from.y));
      for (let step = 1; step <= 5; step++) {
        fireEvent.pointerMove(svg, pointer(from.x + ((to.x - from.x) * step) / 5, from.y + ((to.y - from.y) * step) / 5));
      }
      fireEvent.pointerUp(svg, pointer(to.x, to.y));
    };

    // The kitchen is the polygon filled with its colour.
    const kitchen = svg.querySelector('polygon[fill="#d9912b"]');
    if (!kitchen) return;
    const box = kitchen.getBoundingClientRect();
    fireEvent.pointerDown(kitchen, pointer(box.left + 20, box.top + 20));
    fireEvent.pointerUp(svg, pointer(box.left + 20, box.top + 20));
    // Its top-right corner handle: drag it 80 px right and up.
    const handles = await waitFor(() => {
      const found = svg.querySelectorAll("circle.cursor-grab");
      if (found.length < 4) throw new Error("No handles yet");
      return found;
    });
    const corner = handles[1];
    if (corner) {
      const cornerBox = corner.getBoundingClientRect();
      drag(corner, { x: cornerBox.left + 80, y: cornerBox.top - 40 });
    }
  },
};

/** Placement mode: markers are draggable, and palette entries can be dragged onto the plan. */
export const WithMarkers: Story = {
  render: function Render(args) {
    const [markers, setMarkers] = React.useState<PlanMarker[]>(planMarkerFixtures);
    const [palette, setPalette] = React.useState(planMarkerPaletteFixture);
    const [selected, setSelected] = React.useState<string | null>(null);
    const move = (id: string, x: number, y: number) => {
      const entry = palette.find((candidate) => candidate.id === id);
      if (entry) {
        setPalette((current) => current.filter((candidate) => candidate.id !== id));
        setMarkers((current) => [...current, { ...entry, x, y }]);
      } else {
        setMarkers((current) => current.map((marker) => (marker.id === id ? { ...marker, x, y } : marker)));
      }
    };
    return (
      <FloorPlanEditor
        {...args}
        markers={markers}
        selectedMarkerId={selected}
        onMarkerClick={setSelected}
        onMarkerMove={move}
        markerPalette={
          <ul className="flex flex-wrap gap-2">
            {palette.map((entry) => (
              <PlanMarkerPaletteItem key={entry.id} entry={entry} hint="Drag onto the plan" />
            ))}
          </ul>
        }
      />
    );
  },
};

/** Markers in the read-only plan (children, small screens): tap to select. */
export const WithMarkersReadOnly: Story = { args: { canManage: false, markers: planMarkerFixtures } };

/** An imported architect's plan under the drawing (synthetic), calibrated and lined up; markers stay on top. */
export const WithUnderlay: Story = {
  args: { plan: groundFloorWithUnderlayFixture, underlayUrl: syntheticUnderlayUrl, markers: planMarkerFixtures },
};

/** Just imported: the scale is a guess, the plan is unlocked and slightly turned. Open "Set scale". */
export const UnderlayNotCalibrated: Story = { args: { plan: uncalibratedPlanFixture, underlayUrl: syntheticUnderlayUrl } };

/** Read-only (phones, children): the plan is off until the "Architect's plan" button turns it on. */
export const UnderlayReadOnly: Story = { args: { plan: groundFloorWithUnderlayFixture, underlayUrl: syntheticUnderlayUrl, canManage: false } };

/**
 * Scripted: walls are traced over the plan, no rooms yet. "Fill room" (F) and a click in the living room
 * and the kitchen add both rooms, named from the PDF labels, with the area check in the tools window.
 * The room suggestions from the PDF show as dashed labels until a room covers them.
 */
export const FillingRooms: Story = {
  args: { plan: tracedWallsPlanFixture, underlayUrl: syntheticUnderlayUrl },
  play: async ({ canvasElement }) => {
    const svg = await waitFor(() => {
      const element = canvasElement.querySelector<SVGSVGElement>("svg[role=application]");
      if (!element?.getBoundingClientRect().width) throw new Error("Canvas not ready");
      return element;
    });
    // The walls' screen box: the house is 10 × 8 m, so plan points map linearly onto it.
    const outer = svg.querySelector("polygon.fill-foreground")?.closest("g")?.getBoundingClientRect();
    if (!outer) return;
    const at = (x: number, y: number) => ({
      clientX: outer.left + ((x + 15) / 1030) * outer.width,
      clientY: outer.top + ((y + 15) / 830) * outer.height,
      pointerId: 1,
      button: 0,
      pointerType: "mouse",
      bubbles: true,
    });
    fireEvent.keyDown(window, { key: "f" });
    for (const [x, y] of [
      [250, 300],
      [800, 300],
    ] as const) {
      fireEvent.pointerDown(svg, at(x, y));
      fireEvent.pointerUp(svg, at(x, y));
    }
  },
};

/**
 * North is set (30°): the compass bottom right is a dial (drag it, or focus it and use the arrow keys) and
 * the tools window has the Orientation section. Changes are part of the plan: undo, then Save.
 */
export const WithNorth: Story = { args: { plan: orientedPlanFixture, underlayUrl: syntheticUnderlayUrl } };

/**
 * Scripted "Point north on the plan": opens the north tool and clicks the tail, then the tip of the
 * architect's north arrow (bottom right of the drawing). The tools window shows 30°; "Use this" sets it.
 */
export const PointingNorth: Story = {
  args: { plan: groundFloorWithUnderlayFixture, underlayUrl: syntheticUnderlayUrl },
  play: async ({ canvasElement }) => {
    const svg = await waitFor(() => {
      const element = canvasElement.querySelector<SVGSVGElement>("svg[role=application]");
      if (!element?.getBoundingClientRect().width) throw new Error("Canvas not ready");
      return element;
    });
    const button = [...canvasElement.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
      /point north|noorden aanwijzen/i.test(candidate.textContent ?? ""),
    );
    if (!button) return;
    fireEvent.click(button);
    // The walls' screen box maps plan cm linearly (see FillingRooms).
    const outer = svg.querySelector("polygon.fill-foreground")?.closest("g")?.getBoundingClientRect();
    if (!outer) return;
    for (const point of syntheticNorthArrowOnPlan) {
      const position = {
        clientX: outer.left + ((point.x + 15) / 1030) * outer.width,
        clientY: outer.top + ((point.y + 15) / 830) * outer.height,
        pointerId: 1,
        button: 0,
        pointerType: "mouse",
        bubbles: true,
      };
      fireEvent.pointerDown(svg, position);
      fireEvent.pointerUp(svg, position);
    }
  },
};
