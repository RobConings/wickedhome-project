import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuickActionMenu, QuickActionSheet } from "@/components/shared/quick-actions";
import { childQuickActionFixtures, quickActionFixtures } from "./quick-action-fixtures";

const meta = {
  title: "Shared/QuickActions",
  component: QuickActionSheet,
  args: { actions: quickActionFixtures, onSearch: () => {} },
} satisfies Meta<typeof QuickActionSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Phones: the round "+" that sits in the top bar, next to the bell. */
export const PhoneButton: Story = { globals: { viewport: { value: "mobile1" } } };

/** Phones: the bottom sheet with big coloured tiles, two per row; the odd last one spans the row. */
export const PhoneSheet: Story = {
  args: { defaultOpen: true },
  globals: { viewport: { value: "mobile1" } },
  decorators: [(Story) => <div className="h-[40rem]">{Story()}</div>],
};

/** A child's sheet: only what children can do (the shopping list and the assistant). */
export const PhoneSheetChild: Story = {
  args: { defaultOpen: true, actions: childQuickActionFixtures },
  globals: { viewport: { value: "mobile1" } },
  decorators: [(Story) => <div className="h-[24rem]">{Story()}</div>],
};

/** Desktop: the primary button at the top of the sidebar, its menu open with shortcuts and search. */
export const DesktopMenu: Story = {
  render: (args) => (
    <div className="h-[30rem] w-64 bg-sidebar p-3">
      <QuickActionMenu actions={args.actions} onSearch={args.onSearch} searchShortcut={["Ctrl", "K"]} defaultOpen />
    </div>
  ),
};

/** Desktop, a child: the same menu with fewer actions. */
export const DesktopMenuChild: Story = {
  render: (args) => (
    <div className="h-[16rem] w-64 bg-sidebar p-3">
      <QuickActionMenu actions={childQuickActionFixtures} onSearch={args.onSearch} searchShortcut={["Ctrl", "K"]} defaultOpen />
    </div>
  ),
};

/** Desktop: the button alone, as it sits under the brand. */
export const DesktopButton: Story = {
  render: (args) => (
    <div className="w-64 bg-sidebar p-3">
      <QuickActionMenu actions={args.actions} onSearch={args.onSearch} searchShortcut={["Ctrl", "K"]} />
    </div>
  ),
};
