import * as React from "react";
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  BellIcon,
  BotIcon,
  BookUserIcon,
  BoxIcon,
  ChefHatIcon,
  CalendarDaysIcon,
  CpuIcon,
  FolderIcon,
  FolderKanbanIcon,
  HouseIcon,
  HousePlugIcon,
  HouseWifiIcon,
  ListChecksIcon,
  MapPinIcon,
  PlugIcon,
  SettingsIcon,
  ShoppingCartIcon,
  StoreIcon,
  UsersIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { AppShell, type AppShellNavSection } from "@/components/layout/app-shell";
import { BrandMark } from "@/components/shared/brand-mark";
import { CommandPalette } from "@/components/shared/command-palette";
import { QuickActionMenu, QuickActionSheet } from "@/components/shared/quick-actions";
import { AskButton } from "@/features/assistant";
import { AccountMenu, type SessionUser } from "@/features/auth";
import { NotificationBell, useUnreadNotifications } from "@/features/notifications";
import { type CommandPaletteMode, paletteShortcutKeys, useCommandPaletteShortcuts } from "@/lib/command-palette-shortcuts";
import { useAppBusy } from "@/lib/pending";
import { useScreenContext } from "@/lib/screen-context";
import { quickActionsFor, toQuickActionItems } from "./quick-actions";
import { accentForPath, withNavAccents } from "./section-accents";
// Registers the features' renderers for the assistant's confirmation previews (plan diff…).
import "./assistant-previews";

/**
 * The signed-in frame: the generic AppShell layout filled with WickedHome's navigation, the quick actions
 * (src/app/quick-actions.ts) and the account menu. This is the one place that knows which features exist.
 */
export function AppFrame({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { t } = useTranslation();
  const busy = useAppBusy();
  const { pathname } = useLocation();
  // What the page shows (its route's `handle.screen`), for questions about "this" in the Ask sheet.
  const screen = useScreenContext();
  // Unread notifications (docs/NOTIFICATIONS.md): the bell's badge and the menu item's count, live over SSE.
  const unread = useUnreadNotifications(user.id);
  const unreadBadge = unread ? (unread > 99 ? "99+" : String(unread)) : undefined;

  // Order follows the brand mockup: household management first, connections second, settings last.
  const navigation: AppShellNavSection[] = [
    {
      items: [
        { to: "/", label: t("nav.home"), icon: HouseIcon, end: true },
        { to: "/house", label: t("nav.house"), icon: HouseWifiIcon },
        { to: "/habitants", label: t("nav.habitants"), icon: UsersIcon },
        { to: "/contacts", label: t("nav.contacts"), icon: BookUserIcon },
        { to: "/places", label: t("nav.places"), icon: MapPinIcon },
        { to: "/tasks", label: t("nav.tasks"), icon: ListChecksIcon },
        { to: "/shopping", label: t("nav.shopping"), icon: ShoppingCartIcon },
        { to: "/shops", label: t("nav.shops"), icon: StoreIcon },
        { to: "/inventory", label: t("nav.inventory"), icon: BoxIcon },
        { to: "/recipes", label: t("nav.recipes"), icon: ChefHatIcon },
        { to: "/calendar", label: t("nav.calendar"), icon: CalendarDaysIcon },
        { to: "/energy", label: t("nav.energy"), icon: ZapIcon },
        { to: "/documents", label: t("nav.documents"), icon: FolderIcon },
      ],
    },
    // Finance (docs/FINANCE.md).
    {
      label: t("nav.finance"),
      items: [
        { to: "/expenses", label: t("nav.expenses"), icon: WalletIcon },
        { to: "/income", label: t("nav.income"), icon: BanknoteIcon },
        { to: "/money", label: t("nav.money"), icon: ArrowLeftRightIcon },
        { to: "/projects", label: t("nav.projects"), icon: FolderKanbanIcon },
      ],
    },
    {
      items: [
        { to: "/assistant", label: t("nav.assistant"), icon: BotIcon },
        { to: "/home-assistant", label: t("nav.homeAssistant"), icon: HousePlugIcon },
        { to: "/devices", label: t("nav.devices"), icon: CpuIcon },
        { to: "/integrations", label: t("nav.integrations"), icon: PlugIcon },
        { to: "/notifications", label: t("nav.notifications"), icon: BellIcon, badge: unreadBadge },
      ],
    },
    {
      items: [{ to: "/settings", label: t("nav.settings"), icon: SettingsIcon }],
    },
  ];

  // Section colours (docs/BRANDING.md): per nav item from its link, per page from the URL.
  const coloredNavigation = withNavAccents(navigation);

  // Quick actions (src/app/quick-actions.ts), always reachable: "+" in the phone top bar, "+ Quick action"
  // in the desktop sidebar, and the command palette (Ctrl/Cmd + K, "/", "N"). "Ask the assistant" opens
  // the same chat sheet as the floating Ask button, in place.
  const [askOpen, setAskOpen] = React.useState(false);
  const [palette, setPalette] = React.useState<{ open: boolean; mode: CommandPaletteMode }>({ open: false, mode: "all" });
  const openPalette = (mode: CommandPaletteMode) => setPalette({ open: true, mode });
  useCommandPaletteShortcuts(openPalette);
  const quickActions = toQuickActionItems(quickActionsFor(user.role), t, { assistant: () => setAskOpen(true) });
  const pages = coloredNavigation
    .flatMap((section) => section.items)
    .filter((item) => !item.disabled)
    .map(({ to, label, icon, accent }) => ({ to, label, icon, accent }));

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={coloredNavigation}
      accent={accentForPath(pathname)}
      quickActions={{
        topBar: <QuickActionSheet actions={quickActions} onSearch={() => openPalette("all")} />,
        sidebar: <QuickActionMenu actions={quickActions} onSearch={() => openPalette("all")} searchShortcut={paletteShortcutKeys()} />,
      }}
      account={
        // Phone top bar: bell, then the avatar. Desktop sidebar: the account, the bell at its right.
        <div className="flex items-center gap-1 lg:flex-row-reverse">
          <NotificationBell count={unread} />
          <div className="min-w-0 lg:flex-1">
            <AccountMenu user={user} />
          </div>
        </div>
      }
      menuLabel={t("nav.menu")}
      busy={busy}
    >
      {children}
      {/* Quick "Ask the assistant" from every page (ai/docs/ASSISTANT.md): the floating button stays (one tap,
          bottom corner, clear of the top-bar "+"), but not on the assistant page itself; the sheet is
          always there for the quick action. */}
      <AskButton open={askOpen} onOpenChange={setAskOpen} showTrigger={!pathname.startsWith("/assistant")} screen={screen} />
      <CommandPalette
        open={palette.open}
        mode={palette.mode}
        onOpenChange={(open) => setPalette((current) => ({ ...current, open }))}
        actions={quickActions}
        pages={pages}
      />
    </AppShell>
  );
}
