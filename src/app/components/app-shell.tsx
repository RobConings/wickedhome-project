import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { MenuIcon } from "lucide-react";
import { NavLink } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SectionAccent } from "../lib/section-accent";
import { cn } from "@/lib/utils";

export type AppShellNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Small label after the item, e.g. "Soon". */
  badge?: string;
  /** Rendered but not clickable (features that are not built yet). */
  disabled?: boolean;
  /** Only active on an exact match (use for "/"). */
  end?: boolean;
  /** Section accent of the item (`data-accent`): colours its icon and its active state. */
  accent?: SectionAccent;
};

export type AppShellNavSection = {
  label?: string;
  /** Section accent of the group: tints its label. */
  accent?: SectionAccent;
  items: AppShellNavItem[];
};

type AppShellProps = {
  brand: React.ReactNode;
  navigation: AppShellNavSection[];
  /** Section accent of the current page (`data-accent`): shared components inside pick up its colour. */
  accent?: SectionAccent;
  /** Bottom of the sidebar on desktop, top bar on mobile (e.g. the account menu). */
  account: React.ReactNode;
  /** Accessible name of the mobile menu button and sheet. */
  menuLabel: string;
  /** Something is loading (a page, a submit): shows a thin bar along the top and fades the page if it takes a while. */
  busy?: boolean;
  /**
   * Always-reachable actions (e.g. "+ Quick action"): `topBar` sits in the phone top bar before the account,
   * `sidebar` at the top of the desktop sidebar, under the brand. Only one of the two is visible at a time.
   */
  quickActions?: { topBar: React.ReactNode; sidebar: React.ReactNode };
  children: React.ReactNode;
};

/**
 * The frame around every signed-in page: sidebar on large screens, top bar with a slide-out menu on
 * small screens. It knows nothing about features; navigation and account content come in as props.
 */
export function AppShell({ brand, navigation, account, menuLabel, accent, busy = false, quickActions, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div data-accent={accent} className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {busy && (
        <div className="fixed inset-x-0 top-0 z-50 animate-appear">
          <Progress className="h-0.5 rounded-none bg-transparent" />
        </div>
      )}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center px-5">{brand}</div>
        {quickActions && <div className="px-3 pb-2">{quickActions.sidebar}</div>}
        <ShellNavigation sections={navigation} className="flex-1 overflow-y-auto px-3 py-2" />
        <div className="border-t border-sidebar-border p-3">{account}</div>
      </aside>

      {/* Safe-area padding keeps the bar clear of the notch when installed as a home screen app. */}
      <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b bg-background/85 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] backdrop-blur lg:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={menuLabel}>
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 gap-0 bg-sidebar p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-sidebar-foreground"
          >
            <SheetHeader className="h-14 justify-center px-5">
              <SheetTitle asChild>
                <div>{brand}</div>
              </SheetTitle>
              <SheetDescription className="sr-only">{menuLabel}</SheetDescription>
            </SheetHeader>
            {/* Scrolls inside the panel: on short phone screens the list is longer than the screen. */}
            <ShellNavigation
              sections={navigation}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
              onNavigate={() => setMenuOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1">{brand}</div>
        {quickActions?.topBar}
        {account}
      </header>

      {/* `overflow-x-clip` is only a safety net against sideways page scroll (it keeps `sticky` working);
          wide content belongs in a `ScrollRow` or its own scroll container. */}
      <main
        aria-busy={busy || undefined}
        className={cn(
          "min-w-0 overflow-x-clip pb-[env(safe-area-inset-bottom)] transition-opacity duration-200",
          busy && "opacity-60 delay-500",
        )}
      >
        {children}
      </main>
    </div>
  );
}

type ShellNavigationProps = {
  sections: AppShellNavSection[];
  className?: string;
  /** Called when a link is clicked (closes the mobile menu). */
  onNavigate?: () => void;
};

function ShellNavigation({ sections, className, onNavigate }: ShellNavigationProps) {
  return (
    <nav className={cn("flex flex-col gap-4", className)}>
      {sections.map((section, index) => (
        <div
          key={section.label ?? index}
          // Groups without a title are set apart by a thin rule; titled groups by their (tinted) label.
          className={cn("flex flex-col gap-0.5", index > 0 && !section.label && "border-t border-sidebar-border pt-4")}
        >
          {section.label && (
            <p
              data-accent={section.accent}
              className={cn(
                "flex items-center gap-2 px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase",
                section.accent ? "text-section-foreground" : "text-muted-foreground",
              )}
            >
              {section.accent && <span className="size-1.5 rounded-full bg-section" aria-hidden="true" />}
              {section.label}
            </p>
          )}
          {section.items.map((item) => (
            <ShellNavLink key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

const navItemClass =
  "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0";

function ShellNavLink({ item, onNavigate }: { item: AppShellNavItem; onNavigate?: () => void }) {
  const content = (
    <>
      {/* The icon carries the item's section colour; the label stays neutral and readable. */}
      <item.icon className={cn(!item.disabled && "text-section")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <Badge
          variant={item.disabled ? "outline" : "highlight"}
          className={cn("h-5 px-1.5 text-[10px] tabular-nums", item.disabled && "text-muted-foreground")}
        >
          {item.badge}
        </Badge>
      )}
    </>
  );

  if (item.disabled) {
    return (
      <span aria-disabled="true" className={cn(navItemClass, "cursor-default text-muted-foreground/70")}>
        {content}
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      data-accent={item.accent}
      className={({ isActive }) =>
        cn(
          navItemClass,
          isActive
            ? // Active: section-tinted fill, a bar in the section colour at the left edge, strong text.
              "bg-section-soft font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-section"
            : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )
      }
    >
      {content}
    </NavLink>
  );
}
