import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toDraft } from "@/features/devices/components/profile-draft";
import { ProfileFieldsEditor } from "@/features/devices/components/profile-fields-editor";
import type { DeviceProfile } from "@/features/devices/types/devices";
import { profileFixtures } from "../fixtures";

function Demo({ profile, disabled }: { profile: DeviceProfile; disabled?: boolean }) {
  const [draft, setDraft] = React.useState(() => toDraft(profile));
  return (
    <div className="w-[48rem] max-w-full">
      <ProfileFieldsEditor draft={draft} onChange={setDraft} disabled={disabled} />
    </div>
  );
}

const meta = {
  title: "Features/Devices/Components/ProfileFieldsEditor",
  component: Demo,
  parameters: { layout: "padded" },
  args: { profile: profileFixtures.smoke },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SmokeDetector: Story = {};
export const ChoiceField: Story = { args: { profile: profileFixtures.alarmPanel } };
export const ReadOnly: Story = { args: { disabled: true } };
