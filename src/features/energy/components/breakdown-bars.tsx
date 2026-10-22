import type * as React from "react";
import { cn } from "@/lib/utils";

export type BreakdownItem = {
  key: string;
  label: React.ReactNode;
  /** Icon or avatar before the label. */
  leading?: React.ReactNode;
  value: number;
  /** The value, formatted. */
  valueLabel: string;
  /** Share of the whole, already formatted (e.g. "31 %"). */
  shareLabel?: string;
  /** Grey bar for the remainder ("Other", "Unknown"), so it never reads as one of the measured items. */
  muted?: boolean;
};

type BreakdownBarsProps = {
  items: BreakdownItem[];
  /** Value of a full-width bar; defaults to the largest item. Pass the total to show parts of a whole. */
  max?: number;
  /** Accessible name of the list. */
  label: string;
  className?: string;
};

/**
 * Parts of a whole as a ranked list of horizontal bars: one colour for every measured item, grey for the
 * remainder. Every value is printed, so nothing depends on colour or hover.
 */
export function BreakdownBars({ items, max, label, className }: BreakdownBarsProps) {
  const scale = max ?? Math.max(0, ...items.map((item) => item.value));
  return (
    <ul aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => {
        const width = scale > 0 ? Math.min(100, Math.max(0, (item.value / scale) * 100)) : 0;
        return (
          <li key={item.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {item.leading && <span className="flex shrink-0 text-section">{item.leading}</span>}
                <span className={cn("truncate", item.muted && "text-muted-foreground")}>{item.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="font-medium">{item.valueLabel}</span>
                {item.shareLabel && <span className="w-11 text-right text-xs text-muted-foreground">{item.shareLabel}</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn("h-full rounded-full", item.muted ? "bg-muted-foreground/40" : "bg-section")}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
