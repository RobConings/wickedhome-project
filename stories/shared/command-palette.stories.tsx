import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BotIcon, CalendarDaysIcon, HouseIcon, ListChecksIcon, ShoppingCartIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette, type CommandPalettePage } from "@/components/shared/command-palette";
import { type CommandPaletteMode, useCommandPaletteShortcuts } from "@/lib/command-palette-shortcuts";
import { childQuickActionFixtures, quickActionFixtures } from "./quick-action-fixtures";

const pages: CommandPalettePage[] = [
  { to: "/", label: "Home", icon: HouseIcon, accent: "home" },
  { to: "/tasks", label: "Tasks", icon: ListChecksIcon, accent: "tasks" },
  { to: "/shopping", label: "Shopping", icon: ShoppingCartIcon, accent: "shopping" },
  { to: "/calendar", label: "Calendar", icon: CalendarDaysIcon, accent: "calendar" },
  { to: "/expenses", label: "Expenses", icon: WalletIcon, accent: "finance" },
  { to: "/assistant", label: "Assistant", icon: BotIcon, accent: "assistant" },
];

const meta = {
  title: "Shared/CommandPalette",
  component: CommandPalette,
  args: { open: true, onOpenChange: () => {}, mode: "all", actions: quickActionFixtures, pages },
  decorators: [(Story) => <div className="h-[34rem]">{Story()}</div>],
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ctrl/Cmd + K or "/": the quick actions first, then every page. Type to filter, arrows + Enter, Esc. */
export const Everything: Story = {};

/** "N": only the quick actions; a letter runs one straight away (N, then T = new task). */
export const NewMode: Story = { args: { mode: "new" } };

/** A child: fewer quick actions, every page still there. */
export const Child: Story = { args: { actions: childQuickActionFixtures } };

export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };

/** Try the real shortcuts: Ctrl/Cmd + K, "/" or "N" on this page. */
export const WithShortcuts: Story = {
  args: { open: false },
  render: function Render(args) {
    const [state, setState] = React.useState<{ open: boolean; mode: CommandPaletteMode }>({ open: false, mode: "all" });
    useCommandPaletteShortcuts((mode) => setState({ open: true, mode }));
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm text-muted-foreground">
        <p>Press Ctrl/Cmd + K, “/” or “N”.</p>
        <Button variant="outline" onClick={() => setState({ open: true, mode: "all" })}>
          Open
        </Button>
        <CommandPalette {...args} open={state.open} mode={state.mode} onOpenChange={(open) => setState((current) => ({ ...current, open }))} />
      </div>
    );
  },
};
