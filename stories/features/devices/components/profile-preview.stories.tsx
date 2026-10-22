import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toDraft } from "@/features/devices/components/profile-draft";
import { ProfilePreview } from "@/features/devices/components/profile-preview";
import type { DeviceProfile, FieldValue } from "@/features/devices/types/devices";
import { evaluateIndicator } from "@/features/devices/types/indicator";
import { profileFixtures } from "../fixtures";

function Demo({ profile, initial }: { profile: DeviceProfile; initial: Record<string, FieldValue> }) {
  const draft = toDraft(profile);
  const [values, setValues] = React.useState(initial);
  return (
    <div className="w-[22rem]">
      <ProfilePreview draft={draft} values={values} onValuesChange={setValues} result={evaluateIndicator(draft, values)} />
    </div>
  );
}

const meta = {
  title: "Features/Devices/Components/ProfilePreview",
  component: Demo,
  args: { profile: profileFixtures.climate, initial: { temperature: 21.5, humidity: 48 } },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Comfortable: Story = {};
export const DryerRunning: Story = { args: { profile: profileFixtures.laundry, initial: { power: 1250, remainingMinutes: 42 } } };
export const AlarmTriggered: Story = { args: { profile: profileFixtures.alarmPanel, initial: { state: "triggered" } } };
export const Unknown: Story = { args: { initial: {} } };
