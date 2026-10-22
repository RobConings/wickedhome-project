import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { QuickActionMenu, QuickActionSheet } from "../../src/app/components/quick-actions";
import { quickActionsFor, toQuickActionItems } from "@/app/quick-actions";
import type { Role } from "@/features/auth";

/** The app's real quick-action list (src/app/quick-actions.ts) for one role, as the frame shows it. */
function AppQuickActions({ role, placement }: { role: Role; placement: "phone" | "desktop" }) {
  const { t } = useTranslation();
  const actions = toQuickActionItems(quickActionsFor(role), t, { assistant: () => {} });
  return placement === "phone" ? (
    <QuickActionSheet actions={actions} onSearch={() => {}} defaultOpen />
  ) : (
    <div className="w-64 bg-sidebar p-3">
      <QuickActionMenu actions={actions} onSearch={() => {}} searchShortcut={["Ctrl", "K"]} defaultOpen />
    </div>
  );
}

const meta = {
  title: "App/QuickActions",
  component: AppQuickActions,
  args: { role: "adult", placement: "phone" },
  argTypes: {
    role: { control: "inline-radio", options: ["owner", "adult", "child"] },
    placement: { control: "inline-radio", options: ["phone", "desktop"] },
  },
  decorators: [(Story) => <div className="h-[40rem]">{Story()}</div>],
} satisfies Meta<typeof AppQuickActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An adult on a phone: every action. */
export const AdultPhone: Story = { globals: { viewport: { value: "mobile1" } } };
/** A child on a phone: no finance, tasks, events or scanning; only the shopping list and the assistant. */
export const ChildPhone: Story = { args: { role: "child" }, globals: { viewport: { value: "mobile1" } } };
export const AdultDesktop: Story = { args: { placement: "desktop" } };
export const ChildDesktop: Story = { args: { role: "child", placement: "desktop" } };
