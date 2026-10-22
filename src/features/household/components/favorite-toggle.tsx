import * as React from "react";
import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The native `onToggle` (popover toggle event) makes no sense on a star; ours replaces it.
type FavoriteToggleProps = Omit<React.ComponentProps<"button">, "children" | "onToggle"> & {
  active: boolean;
  /** Accessible label, e.g. "Add to favourites" / "Remove from favourites". */
  label: string;
  size?: "sm" | "md";
  /**
   * Toggle handler that may return a promise. The star flips at once (optimistic) and keeps the new state
   * until the promise settles; then `active` is the truth again, so a failed request flips it back. Show
   * the error yourself (e.g. a toast) inside the handler: a rejection is not passed on.
   */
  onToggle?: (next: boolean) => void | Promise<unknown>;
};

/** Star button that marks an item as a favourite. */
export function FavoriteToggle({
  active,
  label,
  size = "md",
  onToggle,
  onClick,
  className,
  ...props
}: FavoriteToggleProps) {
  // The state shown while a toggle is in flight; null when `active` is the truth.
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
  const shown = optimistic ?? active;

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || !onToggle) return;
    const next = !shown;
    const result = onToggle(next);
    if (!(result instanceof Promise)) return;
    setOptimistic(next);
    const settle = () => setOptimistic(null);
    result.then(settle, settle);
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={shown}
      aria-busy={optimistic !== null || undefined}
      className={cn(
        "grid shrink-0 place-items-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
        size === "sm" ? "size-8" : "size-9",
        className,
      )}
      onClick={handleClick}
      {...props}
    >
      <StarIcon
        aria-hidden="true"
        className={cn(
          "transition-transform",
          size === "sm" ? "size-4" : "size-5",
          shown ? "fill-warning text-warning" : "text-muted-foreground/60",
          // A small pop while the change is being saved.
          optimistic !== null && "scale-110",
        )}
      />
    </button>
  );
}
