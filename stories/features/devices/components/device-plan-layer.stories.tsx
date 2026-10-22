import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { useDevicePlanLayer } from "@/features/devices";
import type { DevicesOverview } from "@/features/devices/types/devices";
import { FloorPlanScreen } from "@/features/places";
import type { FloorPlan } from "@/features/places";
import { groundFloorPlanFixture, outsidePlanFixture } from "../../places/fixtures";
import { devicesOverviewFixture } from "../fixtures";

/**
 * The route-level composition of src/routes/floor-plan.tsx: places' editor with devices as markers and a
 * palette of unplaced devices. Drag a device from the palette onto the plan, or move a placed one.
 */
function FloorPlanWithDevices({ plan, overview, canManage }: { plan: FloorPlan; overview: DevicesOverview | Promise<DevicesOverview>; canManage: boolean }) {
  const layer = useDevicePlanLayer({ overview, floorId: plan.floor.id, canManage, savePosition: async () => undefined });
  return <FloorPlanScreen plan={plan} canManage={canManage} {...layer} />;
}

const meta = {
  title: "Features/Devices/Components/DevicePlanLayer",
  component: FloorPlanWithDevices,
  parameters: { layout: "fullscreen" },
  args: { plan: groundFloorPlanFixture, overview: devicesOverviewFixture, canManage: true },
} satisfies Meta<typeof FloorPlanWithDevices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroundFloorEditor: Story = {};
export const OutsideEditor: Story = { args: { plan: outsidePlanFixture } };
export const AsChild: Story = { args: { canManage: false } };
/**
 * Tap-to-place (touch, pen, keyboard): "Place on the plan" on a device, then tap a spot on the plan (or
 * "Place in the middle"); Esc cancels. A placed, selected marker moves with the arrow keys.
 */
export const TapToPlace: Story = {
  play: async ({ canvasElement }) => {
    const [button] = await within(canvasElement).findAllByRole("button", { name: /^Place on the plan:/ });
    if (button) await userEvent.click(button);
  },
};

/** The plan is there, the devices are still loading: a skeleton palette and no markers yet. */
export const Loading: Story = { args: { overview: new Promise<DevicesOverview>(() => undefined) } };
/** Devices arrive two seconds after the plan (a deferred loader value). */
export const DevicesArriveLater: Story = {
  render: (args) => <FloorPlanWithDevices {...args} overview={new Promise((resolve) => setTimeout(() => resolve(devicesOverviewFixture), 2000))} />,
};
