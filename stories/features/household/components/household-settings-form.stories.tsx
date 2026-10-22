import type { Meta, StoryObj } from "@storybook/react-vite";
import { HouseholdSettingsForm } from "@/features/household/components/household-settings-form";
import {
  emptyHouseholdSettingsFixture,
  householdSettingsFixture,
  manualHouseholdSettingsFixture,
  unlocatedHouseholdSettingsFixture,
} from "../settings-fixtures";

const meta = {
  title: "Features/Household/Components/HouseholdSettingsForm",
  component: HouseholdSettingsForm,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { settings: householdSettingsFixture, canManage: true },
  parameters: { router: { action: async () => ({ ok: true, intent: "household-settings", geocode: "found" }) } },
} satisfies Meta<typeof HouseholdSettingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Address found in the Flemish address register, with a map link to check it. */
export const Located: Story = {};
export const NotLocated: Story = {
  args: { settings: unlocatedHouseholdSettingsFixture },
  parameters: { router: { action: async () => ({ ok: true, intent: "household-settings", geocode: "not_found" }) } },
};
export const ManualCoordinates: Story = { args: { settings: manualHouseholdSettingsFixture } };
export const NoAddressYet: Story = { args: { settings: emptyHouseholdSettingsFixture } };
/** Children see the settings but can't change them. */
export const ReadOnly: Story = { args: { canManage: false } };
/** Saving takes a while (the server looks up the coordinates): the button shows it's busy. */
export const Saving: Story = {
  parameters: { router: { action: () => new Promise(() => undefined) } },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
