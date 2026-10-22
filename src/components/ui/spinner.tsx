import type * as React from "react"
import { LoaderCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A spinning circle for "busy". Without a `label` it is decorative (the surrounding element should
 * carry `aria-busy` or text); with one it announces itself as a status.
 */
function Spinner({ className, label, ...props }: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
