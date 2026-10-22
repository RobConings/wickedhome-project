import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloorSection } from "@/features/places/components/floor-section";
import { firstFloorPlanFixture, floorFixtures, groundFloorPlanFixture, outsidePlanFixture } from "../fixtures";

const meta = {
  title: "Features/Places/Components/FloorSection",
  component: FloorSection,
  parameters: { layout: "padded" },
  args: { floor: floorFixtures.ground, places: groundFloorPlanFixture.places, canManage: true },
} satisfies Meta<typeof FloorSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroundFloor: Story = {};
export const Outside: Story = { args: { floor: floorFixtures.outside, places: outsidePlanFixture.places } };
export const NothingDrawn: Story = { args: { floor: floorFixtures.first, places: firstFloorPlanFixture.places } };
export const EmptyFloor: Story = { args: { floor: floorFixtures.first, places: [] } };
export const AsChild: Story = { args: { canManage: false } };
