import type * as React from "react";
import { RepeatIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { CalendarEntry } from "../types/calendar";
import { CalendarEntryGlyph } from "./calendar-category-icon";
import { entryTitle } from "./calendar-format";
import { ColorDot } from "@/components/shared/color-dot";

type CalendarEntryBadgeProps = {
  entry: Pick<CalendarEntry, "kind" | "title" | "color" | "allDay" | "recurring" | "meta"> & {
    category?: CalendarEntry["category"];
  };
  /** Time shown before the title, e.g. "08:15". */
  time?: string | null;
  /** Drawn as a filled bar, like all-day entries: multi-day entries spanning several days. */
  bar?: boolean;
  /** A bar that started before / goes on after the visible days: that end is square. */
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Compact, colour-coded label of one calendar entry: used in month cells, as a spanning bar for multi-day
 * entries, and anywhere else a small "what's on" pill fits. All-day entries and bars are filled, timed
 * ones get a dot. The icon shows the category (events) or the kind (store visits, birthdays, tasks…).
 */
export function CalendarEntryBadge({
  entry,
  time,
  bar = false,
  continuesBefore = false,
  continuesAfter = false,
  onClick,
  className,
  style,
}: CalendarEntryBadgeProps) {
  const { t } = useTranslation("calendar");
  const title = entryTitle(entry, t);
  const filled = entry.allDay || bar;
  const content = (
    <>
      {!filled && <ColorDot color={entry.color} className="size-2 shrink-0 rounded-full" />}
      {time && <span className="shrink-0 text-muted-foreground tabular-nums">{time}</span>}
      <CalendarEntryGlyph entry={entry} className="size-3" />
      <span className="min-w-0 truncate">{title}</span>
      {entry.recurring && <RepeatIcon className="size-3 shrink-0 opacity-60" aria-label={t("entry.recurring")} />}
    </>
  );
  const classes = cn(
    "flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs font-medium",
    filled && !continuesBefore && "border-l-[3px]",
    continuesBefore && "rounded-l-none",
    continuesAfter && "rounded-r-none",
    onClick && "cursor-pointer transition-[filter] outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:brightness-125",
    !filled && onClick && "hover:bg-accent",
    className,
  );
  const fill = filled
    ? { borderLeftColor: entry.color, backgroundColor: `color-mix(in oklab, ${entry.color} 16%, var(--card))` }
    : undefined;

  return onClick ? (
    <button type="button" className={classes} style={{ ...fill, ...style }} onClick={onClick} title={title}>
      {content}
    </button>
  ) : (
    <span className={classes} style={{ ...fill, ...style }} title={title}>
      {content}
    </span>
  );
}
