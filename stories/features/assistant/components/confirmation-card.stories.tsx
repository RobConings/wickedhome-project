import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConfirmationCard } from "@/features/assistant/components/confirmation-card";

const meta = {
  title: "Features/Assistant/Components/ConfirmationCard",
  component: ConfirmationCard,
  decorators: [(Story) => <div className="w-[26rem] max-w-full">{Story()}</div>],
  args: { summary: "Put 2 × milk on the shopping list", permission: "write", allowRemember: true, onDecide: fn() },
} satisfies Meta<typeof ConfirmationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A harmless write: "Don't ask again" is offered. */
export const HarmlessWrite: Story = {};
/** A write that always asks (no "Don't ask again"). */
export const Write: Story = { args: { summary: "Add “Dentist” on Tue 06/10/2026 08:30–09:30 · Lotte", allowRemember: false } };
/** Money and the alarm: always asks, highlighted. */
export const Sensitive: Story = { args: { summary: "Log € 45,00 at Delhaize on Sat 03/10/2026 (joint account)", permission: "sensitive", allowRemember: false } };
export const ArmAlarm: Story = { args: { summary: "Arm the alarm (away)", permission: "sensitive", allowRemember: false } };
/** With a preview of the change: a list of what will be added, changed or removed. */
export const WithListPreview: Story = {
  args: {
    summary: "Create 3 expenses from the energy bill",
    permission: "sensitive",
    allowRemember: false,
    preview: {
      kind: "list",
      title: "3 payments",
      data: {
        items: [
          { label: "Fluvius – voorschot oktober", detail: "€ 85,40 · 15/10/2026", tone: "add" },
          { label: "Fluvius – voorschot november", detail: "€ 85,40 · 15/11/2026", tone: "add" },
          { label: "Fluvius – voorschot september", detail: "€ 80,00 → € 85,40", tone: "change" },
        ],
      },
    },
  },
};
/** With a preview as label / value pairs. */
export const WithFieldsPreview: Story = {
  args: {
    summary: "Add the room “Slaapkamer 2” on the first floor",
    allowRemember: false,
    preview: { kind: "fields", data: { fields: [{ label: "Size", value: "4,00 × 3,00 m (12 m²)" }, { label: "Where", value: "North of Badkamer" }] } },
  },
};
export const Confirming: Story = { args: { submitting: "confirm" } };
export const Cancelling: Story = { args: { submitting: "cancel" } };
