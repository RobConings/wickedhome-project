import type { Meta, StoryObj } from "@storybook/react-vite";
import { PushDeviceList } from "@/features/notifications";
import { THIS_DEVICE, devicesFixture } from "../fixtures";

const meta = {
  title: "Features/Notifications/Components/PushDeviceList",
  component: PushDeviceList,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: { devices: devicesFixture, currentEndpoint: THIS_DEVICE, onRemove: () => new Promise((resolve) => setTimeout(resolve, 800)) },
} satisfies Meta<typeof PushDeviceList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** This phone, an iPhone, and a PC whose last deliveries failed. Remove asks first and stays busy until done. */
export const Default: Story = {};

export const Empty: Story = { args: { devices: [] } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
