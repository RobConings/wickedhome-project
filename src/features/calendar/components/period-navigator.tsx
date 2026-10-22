import type * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type PeriodNavigatorProps = {
  /** The period shown, e.g. "October 2026" or "5 – 11 Oct 2026". */
  label: React.ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  /** Shows a "Today" button when given. */
  onToday?: () => void;
  previousLabel: string;
  nextLabel: string;
  todayLabel?: string;
  /** Disables the Today button, e.g. when today is already in view. */
  isCurrent?: boolean;
  /** The chosen period is loading: a spinner next to the label (after a short delay). */
  pending?: boolean;
  className?: string;
};

/** "‹ October 2026 ›" with an optional Today button: steps through any kind of period. */
export function PeriodNavigator({
  label,
  onPrevious,
  onNext,
  onToday,
  previousLabel,
  nextLabel,
  todayLabel,
  isCurrent = false,
  pending = false,
  className,
}: PeriodNavigatorProps) {
  return (
    <div aria-busy={pending || undefined} className={cn("flex min-w-0 items-center gap-2", className)}>
      {onToday && todayLabel && (
        <Button type="button" variant="outline" size="sm" onClick={onToday} disabled={isCurrent}>
          {todayLabel}
        </Button>
      )}
      <div className="flex items-center">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onPrevious} aria-label={previousLabel}>
          <ChevronLeftIcon />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onNext} aria-label={nextLabel}>
          <ChevronRightIcon />
        </Button>
      </div>
      <h2 aria-live="polite" className="min-w-0 truncate text-lg font-semibold tracking-tight first-letter:uppercase">
        {label}
      </h2>
      {pending && (
        <span className="flex shrink-0 animate-appear text-muted-foreground">
          <Spinner />
        </span>
      )}
    </div>
  );
}
