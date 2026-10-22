import type * as React from "react";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ScrollRow } from "@/components/layout/scroll-row";
import { cn } from "@/lib/utils";
import { CALENDAR_CATEGORIES, CALENDAR_CATEGORY_COLORS, CALENDAR_KIND_COLORS, type CalendarCategory, type CalendarEntryKind } from "../types/calendar";
import { CalendarCategoryIcon } from "./calendar-category-icon";
import { CalendarEntryIcon } from "./calendar-entry-icon";

/** An overlay source's chip: its id, the icon (entry kind) and the translated label. */
export type CalendarSourceChip = { id: string; kind: CalendarEntryKind; label: string };

type CalendarCategoryFilterProps = {
  /** Categories shown; empty (and no sources) shows everything. */
  selected: readonly CalendarCategory[];
  /** Called with the new categories and sources. */
  onChange: (categories: CalendarCategory[], sources: string[]) => void;
  /** Overlay sources (expenses, waste collection, birthdays, tasks…), shown after the categories. */
  sources?: readonly CalendarSourceChip[];
  selectedSources?: readonly string[];
  className?: string;
};

type ChipProps = {
  active: boolean;
  dimmed: boolean;
  color: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

function Chip({ active, dimmed, color, icon, label, onClick }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-2.5 pl-1 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-7",
        active ? "text-foreground" : "bg-card hover:bg-accent",
        dimmed && "text-muted-foreground",
      )}
      style={active ? { borderColor: color, backgroundColor: `color-mix(in oklab, ${color} 16%, var(--card))` } : undefined}
    >
      <span className={cn("grid size-5 place-items-center rounded-full text-white", dimmed && "opacity-50")} style={{ backgroundColor: color }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * The calendar legend, which doubles as a filter: a chip per event category (colour and icon) and per
 * overlay source (expenses, waste collection, birthdays, tasks…). Tapping chips narrows the calendar to
 * them; nothing selected shows everything.
 */
export function CalendarCategoryFilter({ selected, onChange, sources = [], selectedSources = [], className }: CalendarCategoryFilterProps) {
  const { t } = useTranslation("calendar");
  const filtering = selected.length > 0 || selectedSources.length > 0;
  const toggleCategory = (category: CalendarCategory) =>
    onChange(
      selected.includes(category)
        ? selected.filter((value) => value !== category)
        : CALENDAR_CATEGORIES.filter((value) => value === category || selected.includes(value)),
      [...selectedSources],
    );
  const toggleSource = (id: string) =>
    onChange(
      [...selected],
      selectedSources.includes(id)
        ? selectedSources.filter((value) => value !== id)
        : sources.map((source) => source.id).filter((value) => value === id || selectedSources.includes(value)),
    );

  return (
    // One row that scrolls inside itself below `md` (chips are buttons, so keyboard focus scrolls them into view); wraps from `md`.
    <ScrollRow label={t("filter.label")} gap="sm" wrapFrom="md" focusable={false} className={cn("md:py-0", className)}>
      {CALENDAR_CATEGORIES.map((category) => {
        const active = selected.includes(category);
        return (
          <Chip
            key={category}
            active={active}
            dimmed={filtering && !active}
            color={CALENDAR_CATEGORY_COLORS[category]}
            icon={<CalendarCategoryIcon category={category} className="size-3" />}
            label={t(`categories.${category}`)}
            onClick={() => toggleCategory(category)}
          />
        );
      })}
      {sources.length > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />}
      {sources.map((source) => {
        const active = selectedSources.includes(source.id);
        return (
          <Chip
            key={source.id}
            active={active}
            dimmed={filtering && !active}
            color={CALENDAR_KIND_COLORS[source.kind]}
            icon={<CalendarEntryIcon kind={source.kind} className="size-3" />}
            label={source.label}
            onClick={() => toggleSource(source.id)}
          />
        );
      })}
      {filtering && (
        <button
          type="button"
          onClick={() => onChange([], [])}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-7"
        >
          <XIcon className="size-3.5" aria-hidden="true" />
          {t("filter.clear")}
        </button>
      )}
    </ScrollRow>
  );
}
