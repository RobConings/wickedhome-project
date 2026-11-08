import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceDevicesSection } from "@/features/devices/components/place-devices-section";
import { devicesOverviewFixture, DEVICES_NOW } from "../fixtures";
const meta = { title: "Features/Devices/Components/PlaceDevicesSection", component: PlaceDevicesSection, args: { placeId: devicesOverviewFixture.devices[0]!.place?.id ?? "room", initial: devicesOverviewFixture, live: false, now: DEVICES_NOW } } satisfies Meta<typeof PlaceDevicesSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

