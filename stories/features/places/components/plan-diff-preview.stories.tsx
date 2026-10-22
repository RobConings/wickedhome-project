import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConfirmationCard } from "@/features/assistant/components/confirmation-card";
import { registerAssistantPreviewRenderer } from "@/features/assistant";
import { openingShape } from "@/features/places/components/floor-plan-geometry";
import PlanDiffPreview from "@/features/places/components/plan-diff-preview";
import type { FloorPlan, Point } from "@/features/places/types/places";
import { PLAN_DIFF_KIND, type PlanDiffData, type PlanDiffPoint } from "@/features/places/types/plan-diff";
import { groundFloorPlanFixture } from "../fixtures";

// The confirmation card looks renderers up by kind; the app registers this one in src/app/assistant-previews.ts.
registerAssistantPreviewRenderer(PLAN_DIFF_KIND, PlanDiffPreview);

const tuple = (point: Point): PlanDiffPoint => [point.x, point.y];
const rect = (x: number, y: number, width: number, depth: number): PlanDiffPoint[] => [
  [x, y],
  [x + width, y],
  [x + width, y + depth],
  [x, y + depth],
];

/** The ground floor fixture as an unchanged plan-diff, to add changes to. */
function unchanged(plan: FloorPlan, north: number | null = null): PlanDiffData {
  const walls = plan.elements.flatMap((element) => (element.kind === "wall" ? [element] : []));
  return {
    floor: plan.floor.name,
    north,
    rooms: plan.places.flatMap((place) => (place.polygon ? [{ name: place.name, color: place.color, state: "same" as const, points: place.polygon.map(tuple) }] : [])),
    walls: walls.map((wall) => ({ a: tuple(wall.a), b: tuple(wall.b), thickness: wall.thickness, state: "same" as const })),
    openings: plan.elements.flatMap((element) => {
      if (element.kind === "wall") return [];
      const wall = walls.find((candidate) => candidate.id === element.wallId);
      if (!wall) return [];
      const shape = openingShape(wall, element);
      return [{ kind: element.kind, a: tuple(shape.start), b: tuple(shape.end), ...(element.kind === "door" && { hinge: tuple(shape.hinge), tip: tuple(shape.leafTip) }), state: "same" as const }];
    }),
  };
}

const base = unchanged(groundFloorPlanFixture);

/** "Teken een bureau van 3,2 op 2,8 meter rechts van de keuken". */
const addedRoom: PlanDiffData = {
  ...base,
  rooms: [...base.rooms, { name: "Bureau", color: "#7c5cc4", state: "added", points: rect(1000, 0, 320, 280) }],
};

/** "Maak de keuken 1 m dieper": the old outline dashed, the walls on that side moved, a new window. */
const resized: PlanDiffData = {
  ...base,
  north: 30,
  rooms: base.rooms.map((room) => (room.name === "Kitchen" ? { ...room, state: "changed", before: room.points, points: rect(600, 0, 400, 550) } : room)),
  walls: [...base.walls, { a: [1000, 450], b: [1000, 550], thickness: 30, state: "added" }],
  openings: [...base.openings, { kind: "window", a: [1000, 470], b: [1000, 530], state: "added" }],
};

/** Removing a door and a wall. */
const removed: PlanDiffData = {
  ...base,
  walls: base.walls.map((wall, index) => (index === 8 ? { ...wall, state: "removed" } : wall)),
  openings: base.openings.map((opening, index) => (index === 5 ? { ...opening, state: "removed" } : opening)),
  rooms: base.rooms.map((room) => (room.name === "Storage" ? { ...room, state: "removed" } : room)),
};

const meta = {
  title: "Features/Places/Components/PlanDiffPreview",
  component: PlanDiffPreview,
  args: { preview: { kind: PLAN_DIFF_KIND, title: "Ground floor", data: addedRoom } },
  decorators: [
    (Story) => (
      <div className="w-[26rem] max-w-full rounded-lg border bg-muted/40 p-2.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlanDiffPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new room, drawn against an existing one. */
export const AddedRoom: Story = {};
/** A resized room (old outline dashed), a new wall piece and window; north known (compass). */
export const Resized: Story = { args: { preview: { kind: PLAN_DIFF_KIND, data: resized } } };
/** Things that go away are dashed red. */
export const Removed: Story = { args: { preview: { kind: PLAN_DIFF_KIND, data: removed } } };
/** Phone width: the drawing scales down, the legend wraps. */
export const PhoneWidth: Story = {
  decorators: [
    (Story) => (
      <div className="w-[20rem]">
        <Story />
      </div>
    ),
  ],
};
/** Data that doesn't validate shows a short notice instead of a broken drawing. */
export const InvalidData: Story = { args: { preview: { kind: PLAN_DIFF_KIND, data: { rooms: "nope" } } } };

/** On the assistant's confirmation card: Apply = Confirm. */
export const OnConfirmationCard: StoryObj<typeof ConfirmationCard> = {
  render: (args) => <ConfirmationCard {...args} />,
  args: {
    summary: "Bureau tekenen: 3,2 × 2,8 m rechts van Kitchen op Ground floor",
    permission: "write",
    allowRemember: false,
    onDecide: fn(),
    preview: { kind: PLAN_DIFF_KIND, title: "Ground floor", data: addedRoom },
  },
};
