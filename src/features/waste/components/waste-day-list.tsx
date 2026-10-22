import { cn } from "@/lib/utils";
import type { WasteDay } from "../types/waste";
import { useWasteDayLabel } from "./waste-day-label";
import { WasteCollectionChip } from "./waste-fraction-icon";

type WasteDayListProps = {
  days: WasteDay[];
  /** Today, `YYYY-MM-DD` in the household time zone. */
  today: string;
  className?: string;
};

/** Collection days with their fractions, one row per day. */
export function WasteDayList({ days, today, className }: WasteDayListProps) {
  const label = useWasteDayLabel(today);
  return (
    <ul className={cn("flex flex-col divide-y", className)}>
      {days.map((day) => (
        <li key={day.date} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
          <span className="w-28 shrink-0 text-sm font-medium capitalize tabular-nums">{label(day.date)}</span>
          <span className="flex flex-wrap gap-1.5">
            {day.collections.map((collection) => (
              <WasteCollectionChip key={`${collection.fraction}-${collection.label}`} collection={collection} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
