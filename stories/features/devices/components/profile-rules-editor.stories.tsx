import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toDraft } from "@/features/devices/components/profile-draft";
import { ProfileRulesEditor } from "@/features/devices/components/profile-rules-editor";
import type { DeviceProfile } from "@/features/devices/types/devices";
import { profileFixtures } from "../fixtures";

function Demo({ profile, matchedRuleId }: { profile: DeviceProfile; matchedRuleId?: string }) {
  const [draft, setDraft] = React.useState(() => toDraft(profile));
  return (
    <div className="w-[52rem] max-w-full">
      <ProfileRulesEditor draft={draft} onChange={setDraft} matchedRuleId={matchedRuleId} />
    </div>
  );
}

const meta = {
  title: "Features/Devices/Components/ProfileRulesEditor",
  component: Demo,
  parameters: { layout: "padded" },
  args: { profile: profileFixtures.climate, matchedRuleId: "comfortable" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Temperature bands: below 18, between 18 and 24, above 24. */
export const TemperatureBands: Story = {};
export const AlarmPanel: Story = { args: { profile: profileFixtures.alarmPanel, matchedRuleId: "armed-home" } };
export const Empty: Story = { args: { profile: { ...profileFixtures.light, rules: [] }, matchedRuleId: undefined } };
