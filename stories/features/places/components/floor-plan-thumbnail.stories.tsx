import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloorPlanThumbnail } from "@/features/places/components/floor-plan-thumbnail";
import { groundFloorPlanFixture, outsidePlanFixture } from "../fixtures";

const meta = {
  title: "Features/Places/Components/FloorPlanThumbnail",
  component: FloorPlanThumbnail,
  args: { places: groundFloorPlanFixture.places, elements: groundFloorPlanFixture.elements, label: "Ground floor" },
  decorators: [
    (Story) => (
      <div className="w-80 rounded-lg border bg-background p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FloorPlanThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroundFloor: Story = {};
export const Highlighted: Story = { args: { highlightId: "p-kitchen" } };
/** North known (30°): a small compass in the corner, as on a place's page. */
export const WithCompass: Story = { args: { highlightId: "p-kitchen", north: 30 } };
export const Outside: Story = { args: { places: outsidePlanFixture.places, elements: outsidePlanFixture.elements, highlightId: "p-jacuzzi" } };
