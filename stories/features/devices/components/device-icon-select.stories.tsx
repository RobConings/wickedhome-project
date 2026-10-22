import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeviceIconSelect } from "@/features/devices/components/device-icon-select";
import type { DeviceIconKey } from "@/features/devices/types/devices";

function Demo({ allowNone = false }: { allowNone?: boolean }) {
  const [icon, setIcon] = React.useState<DeviceIconKey | null>(allowNone ? null : "thermometer");
  return <DeviceIconSelect value={icon} onChange={setIcon} allowNone={allowNone} aria-label="Icon" className="w-60" />;
}

const meta = {
  title: "Features/Devices/Components/DeviceIconSelect",
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const OptionalIcon: Story = { args: { allowNone: true } };
