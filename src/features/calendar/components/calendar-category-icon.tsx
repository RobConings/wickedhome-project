import {
  BriefcaseIcon,
  CircleCheckIcon,
  DumbbellIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  HouseIcon,
  PartyPopperIcon,
  PlaneIcon,
  TagIcon,
  TriangleAlertIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CALENDAR_CATEGORY_COLORS, type CalendarCategory, type CalendarEntry } from "../types/calendar";
import { CalendarEntryIcon } from "./calendar-entry-icon";

const ICONS: Record<CalendarCategory, LucideIcon> = {
  family: UsersIcon,
  holiday: PlaneIcon,
  school: GraduationCapIcon,
  work: BriefcaseIcon,
  health: HeartPulseIcon,
  social: PartyPopperIcon,
  sport: DumbbellIcon,
  household: HouseIcon,
  other: TagIcon,
};

type CalendarCategoryIconProps = {
  category: CalendarCategory;
  /** Draw the icon in the category's colour. */
  colored?: boolean;
  className?: string;
};

/** The icon of an event category (a plane for holidays & trips…). Decorative: pair it with a label. */
export function CalendarCategoryIcon({ category, colored = false, className }: CalendarCategoryIconProps) {
  const Icon = ICONS[category];
  return (
    <Icon
      className={cn("size-3.5 shrink-0", className)}
      style={colored ? { color: CALENDAR_CATEGORY_COLORS[category] } : undefined}
      aria-hidden="true"
    />
  );
}

type CalendarEntryGlyphProps = {
  entry: Pick<CalendarEntry, "kind"> & { category?: CalendarEntry["category"]; meta?: CalendarEntry["meta"] };
  className?: string;
};

/**
 * The icon that says what an entry is: the category for household events, the kind for store visits and
 * overlays (birthday, task, bill…). Nothing for an uncategorised event. Bills show their status: a check
 * once paid, a warning when overdue.
 */
export function CalendarEntryGlyph({ entry, className }: CalendarEntryGlyphProps) {
  if (entry.kind === "event") return entry.category ? <CalendarCategoryIcon category={entry.category} className={className} /> : null;
  if (entry.kind === "bill" && entry.meta?.status === "paid") {
    return <CircleCheckIcon className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
  }
  if (entry.kind === "bill" && entry.meta?.status === "overdue") {
    return <TriangleAlertIcon className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
  }
  return <CalendarEntryIcon kind={entry.kind} className={className} />;
}
