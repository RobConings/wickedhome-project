import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconChip } from "./icon-chip";

type SectionHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Id for the heading, so a section can use `aria-labelledby`. */
  id?: string;
  /** A small mark in the current section's colour before the title (list groups, page sections). */
  accent?: boolean;
  /** "This needs you" (e.g. suggestions to confirm): the mark/chip in the peach highlight instead. */
  attention?: boolean;
  /** An icon in a small coloured chip before the title (section colour, or peach with `attention`). */
  icon?: LucideIcon;
  className?: string;
};

export function SectionHeader({ title, description, actions, id, accent = false, attention = false, icon, className }: SectionHeaderProps) {
  return (
    // Actions sit next to the title when there is room and move under it when there is not (phones).
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
        {icon && <IconChip icon={icon} tone={attention ? "highlight" : "primary"} size="sm" />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight break-words">
            {!icon && (accent || attention) && (
              <span
                aria-hidden="true"
                className={cn("h-4 w-1 shrink-0 rounded-full", attention ? "bg-highlight-strong" : "bg-section")}
              />
            )}
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
