import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProfileCard } from "@/features/devices/components/profile-card";
import { profileFixtures } from "../fixtures";

const meta = {
  title: "Features/Devices/Components/ProfileCard",
  component: ProfileCard,
  args: { profile: profileFixtures.climate, className: "w-60" },
} satisfies Meta<typeof ProfileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Climate: Story = {};
export const AlarmPanel: Story = { args: { profile: profileFixtures.alarmPanel } };
export const Custom: Story = { args: { profile: profileFixtures.jacuzzi } };
export const Unused: Story = { args: { profile: { ...profileFixtures.light, deviceCount: 0 } } };

/** The content of a row in the list view (the list draws the dividers and padding). */
export const Row: Story = { args: { variant: "row", className: "w-[28rem]" } };
