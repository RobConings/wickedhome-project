import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KbdGroup } from "@/components/ui/kbd";
import { IconChip } from "./icon-chip";
import type { QuickActionItem } from "./quick-actions";
import type { CommandPaletteMode } from "../lib/command-palette-shortcuts";
import type { SectionAccent } from "../lib/section-accent";

export type CommandPalettePage = {
  to: string;
  label: string;
  icon: LucideIcon;
  accent?: SectionAccent;
};

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: CommandPaletteMode;
  actions: QuickActionItem[];
  /** Pages to jump to (the app's navigation). Not shown in `new` mode. */
  pages?: CommandPalettePage[];
};

/**
 * The keyboard way into the app: a search over the quick actions first, then every page. Opened with
 * Ctrl/Cmd + K or "/" (everything) and "N" (only the quick actions: then a single letter runs one, so
 * N, T = new task); see `useCommandPaletteShortcuts` (`@/lib/command-palette-shortcuts`). A modal dialog:
 * focus stays inside, Esc closes, arrows + Enter pick.
 */
export function CommandPalette({ open, onOpenChange, mode = "all", actions, pages = [] }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  // Fresh search on every opening (adjusting state during render, no effect).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }
  // An action that opens something on this page (a sheet) takes the focus; don't hand it back to the trigger.
  const handOff = React.useRef(false);

  function run(item: { to: string; onSelect?: () => void }) {
    handOff.current = Boolean(item.onSelect);
    onOpenChange(false);
    if (item.onSelect) item.onSelect();
    else void navigate(item.to);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (mode !== "new" || query || event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
    const key = event.key.toLowerCase();
    const action = actions.find((candidate) => candidate.shortcut?.at(-1)?.toLowerCase() === key);
    if (!action) return;
    event.preventDefault();
    run(action);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[max(1rem,12dvh)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          if (!handOff.current) return;
          handOff.current = false;
          event.preventDefault();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("commandPalette.title")}</DialogTitle>
          <DialogDescription>{t(mode === "new" ? "commandPalette.descriptionNew" : "commandPalette.description")}</DialogDescription>
        </DialogHeader>
        <Command loop className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            onKeyDown={handleKeyDown}
            placeholder={t(mode === "new" ? "commandPalette.placeholderNew" : "commandPalette.placeholder")}
            aria-label={t("commandPalette.title")}
            // iOS zooms into inputs under 16 px.
            className="h-12 text-base sm:text-sm"
          />
          <CommandList className="max-h-[min(60dvh,26rem)] p-1">
            <CommandEmpty>{t("commandPalette.empty")}</CommandEmpty>
            <CommandGroup heading={t("commandPalette.actions")}>
              {actions.map((action) => (
                <CommandItem key={action.id} value={action.label} keywords={[action.id]} onSelect={() => run(action)} className="gap-3 py-2">
                  <IconChip tone={action.accent ?? "primary"} size="sm">
                    {/* A `text-` class keeps the item's muted icon colour off the chip's icon. */}
                    <action.icon className="text-section" />
                  </IconChip>
                  <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  {action.shortcut && (
                    <KbdGroup keys={mode === "new" ? action.shortcut.slice(-1) : action.shortcut} className="hidden sm:inline-flex" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {mode === "all" && pages.length > 0 && (
              <>
                <CommandSeparator className="my-1" />
                <CommandGroup heading={t("commandPalette.pages")}>
                  {pages.map((page) => (
                    <CommandItem key={page.to} value={`${page.label} ${page.to}`} onSelect={() => run(page)} className="gap-3 py-2">
                      <span data-accent={page.accent} className="grid size-8 shrink-0 place-items-center">
                        <page.icon className="text-section" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{page.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

