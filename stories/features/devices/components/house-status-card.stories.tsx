import type { Meta, StoryObj } from "@storybook/react-vite";
import { HouseStatusCard } from "@/features/devices/components/house-status-card";
import { HouseStatusCardSkeleton } from "@/features/devices/components/house-status-card-skeleton";
import type { Device, FieldValue } from "@/features/devices/types/devices";
import { DEVICES_NOW, devicesFixture, profilesFixture } from "../fixtures";

/** The sample house with one value changed per device id and field. */
function withValues(changes: Record<string, Record<string, FieldValue>>): Device[] {
  return devicesFixture.map((device) => {
    const change = changes[device.id];
    if (!change) return device;
    return { ...device, values: device.values.map((binding) => (binding.fieldKey in change ? { ...binding, value: change[binding.fieldKey]! } : binding)) };
  });
}

/** A calm evening: everything closed, alarm off, the terrace light off. */
const calm = withValues({
  "d-kitchen-left": { isOpen: false },
  "d-alarm": { state: "disarmed" },
  "d-terrace-light": { on: false },
});

/** Trouble: the smoke detector goes off while a window is open and the alarm is triggered. */
const alerts = withValues({
  "d-hall-smoke": { triggered: true },
  "d-alarm": { state: "triggered" },
  "d-living-window": { isOpen: true },
});

const meta = {
  title: "Features/Devices/Components/HouseStatusCard",
  component: HouseStatusCard,
  args: { status: { devices: calm, profiles: profilesFixture }, live: false, now: DEVICES_NOW, className: "w-[26rem] max-w-full" },
} satisfies Meta<typeof HouseStatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing needs attention; the dryer is running, temperatures below. */
export const Default: Story = {};
/** Worst state first: alarm and smoke detector (red), then the open windows. */
export const Alerts: Story = { args: { status: { devices: alerts, profiles: profilesFixture } } };
/** The sample house as in the other stories: a kitchen window open, the alarm armed (home). */
export const SampleHouse: Story = { args: { status: { devices: devicesFixture, profiles: profilesFixture } } };
export const Empty: Story = { args: { status: { devices: [], profiles: [] } } };
/** The Suspense fallback while `fetchHouseStatus()` loads. */
export const Loading: Story = { render: (args) => <HouseStatusCardSkeleton className={args.className} /> };
/** No live connection: the badge says so; the last known values stay visible. */
export const Offline: Story = { args: { liveStatus: "offline" } };
export const Connecting: Story = { args: { liveStatus: "connecting" } };

/** Phones: one fact per line, the link to the house view a full-width row (never clipped). */
export const Mobile: Story = { args: { className: undefined }, globals: { viewport: { value: "mobile1" } } };
/** The empty state on a phone: "Add devices" is full width and wraps. */
export const EmptyMobile: Story = { args: { status: { devices: [], profiles: [] }, className: undefined }, globals: { viewport: { value: "mobile1" } } };
