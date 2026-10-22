import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloorPlanScreen } from "@/features/places/screens/floor-plan-screen";
import { groundFloorPlanFixture, outsidePlanFixture } from "../fixtures";

const meta = {
  title: "Features/Places/Screens/FloorPlanScreen",
  component: FloorPlanScreen,
  parameters: { layout: "fullscreen" },
  args: { plan: groundFloorPlanFixture, canManage: true },
} satisfies Meta<typeof FloorPlanScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroundFloor: Story = {};
export const Outside: Story = { args: { plan: outsidePlanFixture } };
export const AsChild: Story = { args: { canManage: false } };
