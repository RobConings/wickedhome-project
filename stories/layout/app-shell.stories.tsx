import type { Meta, StoryObj } from "@storybook/react-vite";
import { HouseIcon, LayoutGridIcon, ListChecksIcon, PlusIcon, ShoppingCartIcon, UsersIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

function Box({ label, className = "h-24" }: { label: string; className?: string }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed border-primary/40 bg-accent/40 text-sm text-accent-foreground ${className}`}>
      {label}
    </div>
  );
}

const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen", router: { initialEntries: ["/people"] } },
  args: {
    // A layout story may not use shared components either, so the brand is a plain placeholder.
    brand: <span className="font-semibold">Brand</span>,
    menuLabel: "Open navigation",
    // Section accents (docs/BRANDING.md): each item's icon in its colour, the active one tinted.
    accent: "assistant",
    navigation: [
      {
        items: [
          { to: "/", label: "Overview", icon: HouseIcon, end: true, accent: "home" },
          { to: "/people", label: "People", icon: UsersIcon, accent: "assistant", badge: "3" },
        ],
      },
      {
        label: "Section",
        accent: "finance",
        items: [
          { to: "/rooms", label: "Rooms", icon: LayoutGridIcon, accent: "finance" },
          { to: "/tasks", label: "Tasks", icon: ListChecksIcon, badge: "Soon", disabled: true },
          { to: "/shopping", label: "Shopping", icon: ShoppingCartIcon, badge: "Soon", disabled: true },
        ],
      },
    ],
    account: <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">RC</span>,
    children: (
      <PageContainer>
        <Box label="Page content" className="h-64" />
      </PageContainer>
    ),
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };

/** A page is loading: thin bar along the top; the page fades if it takes longer than half a second. */
export const Busy: Story = { args: { busy: true } };

// The `quickActions` slot with plain placeholders (the app fills it with the shared QuickActionSheet and
// QuickActionMenu: see Shared/QuickActions).
const quickActions = {
  topBar: (
    <Button size="icon-lg" className="rounded-full" aria-label="Quick action">
      <PlusIcon className="size-5" />
    </Button>
  ),
  sidebar: (
    <Button className="w-full justify-start">
      <PlusIcon />
      Quick action
    </Button>
  ),
};

/** Desktop: the always-reachable "+ Quick action" at the top of the sidebar. */
export const DesktopWithQuickActions: Story = { args: { quickActions } };
/** Phones: the "+" in the top bar, before the account (bell and avatar). */
export const MobileWithQuickActions: Story = { args: { quickActions }, globals: { viewport: { value: "mobile1" } } };
