import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeviceIcon } from "@/features/devices/components/device-icon";
import { DEVICE_ICONS } from "@/features/devices/types/devices";

function AllIcons() {
  return (
    <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8">
      {DEVICE_ICONS.map((icon) => (
        <li key={icon} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <DeviceIcon icon={icon} className="size-5 text-foreground" />
          {icon}
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: "Features/Devices/Components/DeviceIcon",
  component: DeviceIcon,
  args: { icon: "thermometer", className: "size-6" },
} satisfies Meta<typeof DeviceIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};
/** Unknown keys fall back to a plug. */
export const UnknownKey: Story = { args: { icon: "toaster" } };
export const Catalogue: Story = { render: () => <AllIcons /> };
