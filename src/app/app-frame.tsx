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
  PackageIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShoppingCartIcon,
  StoreIcon,
  UsersIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ScrollRestoration, useLocation } from "react-router";
import { AppShell, type AppShellNavSection } from "@/components/layout/app-shell";
import { BrandMark } from "@/components/shared/brand-mark";
import { CommandPalette } from "@/components/shared/command-palette";
import { QuickActionMenu, QuickActionSheet } from "@/components/shared/quick-actions";
import { AskButton } from "@/features/assistant";
import { AccountMenu, type SessionUser } from "@/features/auth";
import { NotificationBell, useUnreadNotifications } from "@/features/notifications";
import { type CommandPaletteMode, paletteShortcutKeys, useCommandPaletteShortcuts } from "@/lib/command-palette-shortcuts";
import { useAppBusy } from "@/lib/pending";
import { PageIdentityProvider } from "@/lib/page-identity";
import { useScreenContext } from "@/lib/screen-context";
import { quickActionsFor, toQuickActionItems } from "./quick-actions";
import { accentForPath, withNavAccents } from "./section-accents";
import { useLinkedRecordRefresh } from "./use-linked-record-refresh";
// Registers the features' renderers for the assistant's confirmation previews (plan diff…).
import "./assistant-previews";

/**
 * The signed-in frame: the generic AppShell layout filled with WickedHome's navigation, the quick actions
 * (src/app/quick-actions.ts) and the account menu. This is the one place that knows which features exist.
 */
export function AppFrame({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  useLinkedRecordRefresh();
  const { t } = useTranslation();
  const busy = useAppBusy();
  const { pathname } = useLocation();
  // What the page shows (its route's `handle.screen`), for questions about "this" in the Ask sheet.
  const screen = useScreenContext();
  // Unread notifications (docs/NOTIFICATIONS.md): the bell's badge and the menu item's count, live over SSE.
  const unread = useUnreadNotifications(user.id);
  const unreadBadge = unread ? (unread > 99 ? "99+" : String(unread)) : undefined;

  const navigation: AppShellNavSection[] = [
    { label: t("nav.dailyLife"), items: [
      { to: "/", label: t("nav.home"), icon: HouseIcon, end: true },
      { to: "/tasks", label: t("nav.tasks"), icon: ListChecksIcon },
      { to: "/projects", label: t("nav.projects"), icon: FolderKanbanIcon },
      { to: "/shopping", label: t("nav.shopping"), icon: ShoppingCartIcon },
      { to: "/inventory", label: t("nav.inventory"), icon: BoxIcon },
      { to: "/recipes", label: t("nav.recipes"), icon: ChefHatIcon },
      { to: "/calendar", label: t("nav.calendar"), icon: CalendarDaysIcon },
    ] },
    { label: t("nav.finance"), items: [
      { to: "/purchases", label: t("nav.purchases"), icon: ReceiptTextIcon },
      { to: "/expenses", label: t("nav.expenses"), icon: WalletIcon },
      { to: "/income", label: t("nav.income"), icon: BanknoteIcon },
      { to: "/money", label: t("nav.money"), icon: ArrowLeftRightIcon },
    ] },
    { label: t("nav.ourHome"), items: [
      { to: "/house", label: t("nav.house"), icon: HouseWifiIcon },
      { to: "/places", label: t("nav.places"), icon: MapPinIcon },
      { to: "/devices", label: t("nav.devices"), icon: CpuIcon },
      { to: "/energy", label: t("nav.energy"), icon: ZapIcon },
      { to: "/habitants", label: t("nav.habitants"), icon: UsersIcon },
    ] },
    { label: t("nav.library"), items: [
      { to: "/shopping/products", label: t("nav.products"), icon: PackageIcon },
      { to: "/shops", label: t("nav.shops"), icon: StoreIcon },
      { to: "/documents", label: t("nav.documents"), icon: FolderIcon },
      { to: "/contacts", label: t("nav.contacts"), icon: BookUserIcon },
    ] },
    { label: t("nav.system"), items: [
      { to: "/assistant", label: t("nav.assistant"), icon: BotIcon },
      { to: "/home-assistant", label: t("nav.homeAssistant"), icon: HousePlugIcon },
      { to: "/integrations", label: t("nav.integrations"), icon: PlugIcon },
      { to: "/notifications", label: t("nav.notifications"), icon: BellIcon, badge: unreadBadge },
      { to: "/settings", label: t("nav.settings"), icon: SettingsIcon },
    ] },
  ];

  // Section colours (docs/BRANDING.md): per nav item from its link, per page from the URL.
  const coloredNavigation = withNavAccents(navigation);
  const allPages = coloredNavigation.flatMap((section) => section.items);
  const currentSection = allPages.filter((page) => page.to === "/" ? pathname === "/" : pathname === page.to || pathname.startsWith(`${page.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const identity = currentSection ? { icon: currentSection.icon, section: { to: currentSection.to, label: currentSection.label }, isSectionRoot: pathname === currentSection.to } : null;
  const mobileItems = ["/", "/tasks", "/shopping", "/places"].flatMap((to) => {
    const page = allPages.find((item) => item.to === to);
    return page ? [{ ...page, label: to === "/places" ? t("nav.rooms") : page.label }] : [];
  });

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
      mobileNavigation={{ items: mobileItems, label: t("nav.dailyNavigation"), moreLabel: t("nav.more") }}
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
      <PageIdentityProvider value={identity}>{children}</PageIdentityProvider>
      <ScrollRestoration getKey={(location) => `${location.pathname}${location.search}`} />
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
