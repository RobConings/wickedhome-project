import {
  CakeIcon,
  CalendarIcon,
  FileTextIcon,
  ListChecksIcon,
  RefreshCwIcon,
  ShoppingBagIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEntryKind } from "../types/calendar";

const ICONS: Record<CalendarEntryKind, LucideIcon> = {
  event: CalendarIcon,
  store_visit: ShoppingBagIcon,
  birthday: CakeIcon,
  task: ListChecksIcon,
  bill: FileTextIcon,
  renewal: RefreshCwIcon,
  waste: Trash2Icon,
  other: CalendarIcon,
};

type CalendarEntryIconProps = {
  kind: CalendarEntryKind;
  className?: string;
};

/** The icon for a kind of calendar entry (store visit, birthday, task…). Decorative. */
export function CalendarEntryIcon({ kind, className }: CalendarEntryIconProps) {
  const Icon = ICONS[kind];
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
}
