import type { Meta, StoryObj } from "@storybook/react-vite";
import { DevicePaletteSkeleton } from "@/features/devices/components/device-palette-skeleton";

const meta = {
  title: "Features/Devices/Components/DevicePaletteSkeleton",
  component: DevicePaletteSkeleton,
  decorators: [
    (Story) => (
      <div className="w-[40rem] max-w-full rounded-xl border border-dashed bg-muted/40 p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DevicePaletteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
