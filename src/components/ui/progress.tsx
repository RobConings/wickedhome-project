import type * as React from "react"
import { cn } from "@/lib/utils"

type ProgressProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** 0–100. Leave it out when the end is unknown: the bar then slides back and forth. */
  value?: number | null
  /** Accessible name, e.g. "Importing readings". */
  label?: string
}

/** A horizontal progress bar, determinate (`value`) or indeterminate. */
function Progress({ value, label, className, ...props }: ProgressProps) {
  const indeterminate = value == null
  const percent = indeterminate ? 0 : Math.min(100, Math.max(0, value))

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      data-slot="progress"
      // The bar takes the current section's colour (`data-accent`, docs/BRANDING.md).
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-section/15", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full bg-section",
          indeterminate ? "absolute inset-y-0 w-1/3 animate-indeterminate" : "transition-[width] duration-300",
        )}
        style={indeterminate ? undefined : { width: `${percent}%` }}
      />
    </div>
  )
}

export { Progress }
