import type * as React from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { IconChip, type IconChipTone } from "./icon-chip";

export type TimelineItem = {
  id: string;
  /** Left column, already formatted: "08:15", "All day"… */
  time: React.ReactNode;
  /** Icon element shown in a chip. */
  icon: React.ReactNode;
  tone?: IconChipTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Makes the title a link. */
  href?: string | null;
};

type TimelineListProps = {
  items: TimelineItem[];
  className?: string;
};

/** A day at a glance: time, icon chip, title and subtitle per row, joined by a thin line. */
export function TimelineList({ items, className }: TimelineListProps) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => (
        <li key={item.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
          <span className="w-14 shrink-0 pt-2 text-right text-xs leading-tight font-medium text-muted-foreground tabular-nums">
            {item.time}
          </span>
          {index < items.length - 1 && (
            // Between this chip and the next one: time column (3.5rem) + gap (0.75rem) + half a chip (1rem).
            <span aria-hidden="true" className="absolute top-9 bottom-1 left-[5.25rem] w-px -translate-x-1/2 bg-border" />
          )}
          <IconChip tone={item.tone ?? "primary"} size="sm">
            {item.icon}
          </IconChip>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
            {item.href ? (
              <Link to={item.href} className="truncate text-sm font-medium outline-none hover:underline focus-visible:underline">
                {item.title}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium">{item.title}</span>
            )}
            {item.subtitle && <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
