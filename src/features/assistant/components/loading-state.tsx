import type * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders. Pick the one shaped like the content that is coming, so the page doesn't jump
 * when it arrives: skeletons for lists, tiles and charts, `LoadingState` for small areas without a shape,
 * and `PendingContent` when content is already on screen and is being refreshed.
 */

/** Spinner with a short text, centred in the space the content will take. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex min-h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground", className)}
    >
      <Spinner className="size-5" />
      <span>{label}</span>
    </div>
  );
}

/** Rows like a list of items: a leading icon, a title and a sub line. */
export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col divide-y", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4" style={{ width: `${70 - ((index * 13) % 30)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A row of stat tiles. */
export function SkeletonTiles({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A chart, map or other big block. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("h-64 w-full rounded-xl", className)} />;
}

/** Header, tiles and a list: for a whole screen whose shape isn't worth copying. */
export function SkeletonPage({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <SkeletonTiles />
      <div className="rounded-xl border bg-card px-4">
        <SkeletonList />
      </div>
    </div>
  );
}

type PendingContentProps = {
  /** True while newer content is loading (another period, filter, page…). */
  pending: boolean;
  /** Announced to screen readers and shown next to the spinner. */
  label?: string;
  /** The wrapper (size, position). */
  className?: string;
  /** Layout of the content itself (e.g. `flex flex-col gap-4`): the children sit in this inner element. */
  contentClassName?: string;
  children: React.ReactNode;
};

/**
 * Keeps the current content visible but fades it and shows a spinner while newer content loads, so a
 * click always gets a visible answer. Short loads (< 250 ms) show nothing, to avoid flicker.
 */
export function PendingContent({ pending, label, className, contentClassName, children }: PendingContentProps) {
  return (
    <div aria-busy={pending || undefined} className={cn("relative", className)}>
      <div
        className={cn(
          "transition-opacity duration-200",
          contentClassName,
          pending && "pointer-events-none opacity-50 delay-200",
        )}
      >
        {children}
      </div>
      {pending && (
        <div
          role="status"
          className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 animate-appear items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
        >
          <Spinner className="size-3.5" />
          {label && <span>{label}</span>}
        </div>
      )}
    </div>
  );
}
