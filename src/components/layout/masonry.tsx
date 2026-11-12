import type * as React from "react";
import { cn } from "@/lib/utils";

/** Keep each card together while filling two content columns from tablet widths. */
export function Masonry({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("columns-1 gap-4 md:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid", className)} {...props} />;
}
