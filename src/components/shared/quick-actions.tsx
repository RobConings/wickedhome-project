import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { IconChip } from "@/components/shared/icon-chip";
import type { SectionAccent } from "@/lib/section-accent";
import { cn } from "@/lib/utils";

/** One quick action ("New task", "Log an expense"…): the app frame builds the list, these components show it. */
export type QuickActionItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Colour of the section it opens (docs/BRANDING.md). */
  accent?: SectionAccent;
  /** Where it goes: usually a screen that opens its form from the URL (`/tasks?new=1`). */
  to: string;
  /** Run this instead of navigating (e.g. open a sheet that is already on the page). */
  onSelect?: () => void;
  /** Keys pressed one after the other, e.g. ["N", "T"]. */
  shortcut?: string[];
};

type QuickActionTriggerProps = {
  actions: QuickActionItem[];
  /** Opens the command palette ("Search pages and actions"); left out = no search entry. */
  onSearch?: () => void;
  /** Keys that open the palette, shown next to the search entry (desktop menu). */
  searchShortcut?: string[];
  /** Open on first render (stories). */
  defaultOpen?: boolean;
  className?: string;
};

/**
 * Something else takes the focus after the sheet or menu closes (another sheet, the palette): skip the
 * usual "focus back on the trigger", which would steal it.
 */
function useFocusHandOff() {
  const handOff = React.useRef(false);
  return {
    mark: () => {
      handOff.current = true;
    },
    onCloseAutoFocus: (event: Event) => {
      if (!handOff.current) return;
      handOff.current = false;
      event.preventDefault();
    },
  };
}

const tileClass =
  "flex h-full min-h-28 w-full flex-col items-center justify-center gap-2.5 rounded-xl border bg-card p-3 text-center text-sm font-medium transition-[background-color,transform] outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]";

/**
 * Phones: a round "+" in the top bar that opens a bottom sheet with the quick actions as big coloured tiles,
 * two per row (an odd last one spans the row), within thumb reach.
 */
export function QuickActionSheet({ actions, onSearch, defaultOpen = false, className }: QuickActionTriggerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(defaultOpen);
  const focus = useFocusHandOff();

  function handOver(run: () => void) {
    focus.mark();
    setOpen(false);
    run();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="icon-lg" className={cn("rounded-full shadow-sm", className)} aria-label={t("quickActions.open")} title={t("quickActions.open")}>
          <PlusIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl pr-[env(safe-area-inset-right)] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)]"
        onCloseAutoFocus={focus.onCloseAutoFocus}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>{t("quickActions.title")}</SheetTitle>
          <SheetDescription>{t("quickActions.description")}</SheetDescription>
        </SheetHeader>
        <ul className="grid grid-cols-2 gap-3 px-4 [&>li:last-child:nth-child(odd)]:col-span-2">
          {actions.map((action) => {
            const content = (
              <>
                <IconChip tone={action.accent ?? "primary"} className="size-12 rounded-xl [&_svg]:size-6">
                  <action.icon />
                </IconChip>
                <span className="leading-tight break-words">{action.label}</span>
              </>
            );
            const onSelect = action.onSelect;
            return (
              <li key={action.id}>
                {onSelect ? (
                  <button type="button" className={tileClass} onClick={() => handOver(onSelect)}>
                    {content}
                  </button>
                ) : (
                  <Link to={action.to} className={tileClass} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        {onSearch && (
          <div className="px-4 pt-3">
            <Button variant="outline" size="lg" className="w-full" onClick={() => handOver(onSearch)}>
              <SearchIcon />
              {t("quickActions.search")}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Desktop: the primary "+ Quick action" button at the top of the sidebar, opening a menu with the same
 * actions, their keyboard shortcuts and the way into the command palette.
 */
export function QuickActionMenu({ actions, onSearch, searchShortcut, defaultOpen, className }: QuickActionTriggerProps) {
  const { t } = useTranslation();
  const focus = useFocusHandOff();

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button className={cn("w-full justify-start", className)} title={t("quickActions.openHint")}>
          <PlusIcon />
          <span className="flex-1 truncate text-left">{t("quickActions.open")}</span>
          <Kbd className="border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground">N</Kbd>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-64" onCloseAutoFocus={focus.onCloseAutoFocus}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("quickActions.title")}</DropdownMenuLabel>
        {actions.map((action) => {
          const content = (
            <>
              <IconChip tone={action.accent ?? "primary"} size="sm">
                {/* A `text-` class keeps the menu's muted icon colour off the chip's icon. */}
                <action.icon className="text-section" />
              </IconChip>
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
              {action.shortcut && (
                <DropdownMenuShortcut>
                  <KbdGroup keys={action.shortcut} />
                </DropdownMenuShortcut>
              )}
            </>
          );
          const onSelect = action.onSelect;
          return onSelect ? (
            <DropdownMenuItem
              key={action.id}
              className="gap-3"
              onSelect={() => {
                focus.mark();
                onSelect();
              }}
            >
              {content}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={action.id} asChild className="gap-3">
              <Link to={action.to}>{content}</Link>
            </DropdownMenuItem>
          );
        })}
        {onSearch && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-3"
              onSelect={() => {
                focus.mark();
                onSearch();
              }}
            >
              <span className="grid size-8 place-items-center">
                <SearchIcon />
              </span>
              <span className="min-w-0 flex-1 truncate">{t("quickActions.search")}</span>
              {searchShortcut && (
                <DropdownMenuShortcut>
                  <KbdGroup keys={searchShortcut} />
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
